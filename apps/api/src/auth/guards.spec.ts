import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { UserRole } from '@repo/shared';
import { ActivityService } from '../activity/activity.service.js';
import { AuthGuard } from './auth.guard.js';
import { IS_PUBLIC_KEY, ROLES_KEY } from './decorators.js';
import { RolesGuard } from './roles.guard.js';

const jwt = new JwtService({ secret: 'test-secret-that-is-long-enough-1234567890' });

// A minimal stand-in for the request context Nest passes to guards.
function contextFor(
  request: Record<string, unknown>,
  metadata: Record<string, unknown> = {},
  type: 'http' | 'ws' = 'http',
) {
  const handler = () => undefined;
  for (const [key, value] of Object.entries(metadata)) Reflect.defineMetadata(key, value, handler);
  return {
    getType: () => type,
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('AuthGuard', () => {
  const activity = new ActivityService();
  const guard = new AuthGuard(jwt, new Reflector(), activity);

  it('lets @Public() routes through without a token', async () => {
    await expect(guard.canActivate(contextFor({ headers: {} }, { [IS_PUBLIC_KEY]: true }))).resolves.toBe(true);
  });

  it('rejects a request with no token', async () => {
    await expect(guard.canActivate(contextFor({ headers: {} }))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a token signed with another secret', async () => {
    const forged = await new JwtService({ secret: 'some-other-secret-entirely-1234567890' }).signAsync({ sub: 'u1', role: 'provider' });
    const request = { headers: { authorization: `Bearer ${forged}` } };
    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an expired token', async () => {
    const expired = await jwt.signAsync({ sub: 'u1', role: 'driver' }, { expiresIn: -1 });
    const request = { headers: { authorization: `Bearer ${expired}` } };
    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('leaves socket contexts alone (they authenticate at the handshake)', async () => {
    await expect(guard.canActivate(contextFor({}, {}, 'ws'))).resolves.toBe(true);
  });

  it('attaches the user for a valid token', async () => {
    const token = await jwt.signAsync({ sub: 'u1', role: 'driver' });
    const request: Record<string, unknown> = { headers: { authorization: `Bearer ${token}` } };
    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.user).toEqual({ id: 'u1', role: 'driver' });
  });

  it('counts only signed-in requests as activity (not anonymous scans or public routes)', async () => {
    const fresh = new ActivityService();
    const watching = new AuthGuard(jwt, new Reflector(), fresh);
    await watching.canActivate(contextFor({ headers: {} }, { [IS_PUBLIC_KEY]: true }));
    await watching.canActivate(contextFor({ headers: {} })).catch(() => {});
    expect(fresh.isActive()).toBe(false);

    const token = await jwt.signAsync({ sub: 'u1', role: 'driver' });
    await watching.canActivate(contextFor({ headers: { authorization: `Bearer ${token}` } }));
    expect(fresh.isActive()).toBe(true);
  });
});

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());
  const as = (role: UserRole) => ({ user: { id: 'u1', role } });

  it('allows any authenticated user when no roles are required', () => {
    expect(guard.canActivate(contextFor(as('driver')))).toBe(true);
  });

  it('allows a matching role', () => {
    expect(guard.canActivate(contextFor(as('provider'), { [ROLES_KEY]: ['provider'] }))).toBe(true);
  });

  it('forbids the wrong role with 403, not 401', () => {
    expect(() => guard.canActivate(contextFor(as('driver'), { [ROLES_KEY]: ['provider'] }))).toThrow(ForbiddenException);
  });
});
