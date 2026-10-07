import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ActivityService } from '../activity/activity.service.js';
import type { AccessTokenPayload } from './access-token.js';
import { IS_PUBLIC_KEY, type AuthUser } from './decorators.js';

// Registered globally: every route needs a valid access token unless marked @Public().
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly activity: ActivityService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Sockets authenticate once at the handshake (see RealtimeGateway), not per message.
    if (context.getType() !== 'http') return true;

    // Handler-level metadata wins over controller-level.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const [scheme, token] = (request.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException('Missing access token');

    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
      request.user = { id: payload.sub, role: payload.role } satisfies AuthUser;
      // Only signed-in use keeps the background sweeps running: anonymous scans and health checks
      // on a public URL must not keep the database awake.
      this.activity.touch();
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
    return true;
  }
}
