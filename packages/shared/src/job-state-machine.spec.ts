import { describe, expect, it } from 'vitest';
import { JOB_STATUSES, USER_ROLES, type JobStatus, type UserRole } from './enums';
import { checkJobTransition, isTerminalJobStatus, nextJobStatuses } from './job-state-machine';

// The complete list of allowed transitions. Every other (from, to, role) combination must be refused.
const ALLOWED: [JobStatus, JobStatus, UserRole][] = [
  ['accepted', 'en_route', 'provider'],
  ['en_route', 'arrived', 'provider'],
  ['arrived', 'in_progress', 'provider'],
  ['in_progress', 'completed', 'provider'],
  ['accepted', 'cancelled', 'driver'],
  ['accepted', 'cancelled', 'provider'],
  ['en_route', 'cancelled', 'driver'],
  ['en_route', 'cancelled', 'provider'],
  ['arrived', 'cancelled', 'driver'],
  ['arrived', 'cancelled', 'provider'],
];

describe('job state machine', () => {
  it.each(ALLOWED)('allows %s -> %s by %s', (from, to, role) => {
    expect(checkJobTransition(from, to, role)).toEqual({ ok: true });
  });

  it('refuses every combination not explicitly allowed', () => {
    const isAllowed = (from: JobStatus, to: JobStatus, role: UserRole) =>
      ALLOWED.some(([f, t, r]) => f === from && t === to && r === role);
    let checked = 0;
    for (const from of JOB_STATUSES)
      for (const to of JOB_STATUSES)
        for (const role of USER_ROLES) {
          if (isAllowed(from, to, role)) continue;
          expect(checkJobTransition(from, to, role).ok, `${from} -> ${to} by ${role}`).toBe(false);
          checked++;
        }
    expect(checked).toBe(6 * 6 * 2 - ALLOWED.length);
  });

  it('distinguishes "wrong role" from "impossible transition"', () => {
    expect(checkJobTransition('en_route', 'arrived', 'driver')).toEqual({ ok: false, reason: 'NOT_ALLOWED_FOR_ROLE' });
    expect(checkJobTransition('accepted', 'completed', 'provider')).toEqual({ ok: false, reason: 'INVALID_TRANSITION' });
  });

  it('cannot skip steps or go backwards', () => {
    expect(checkJobTransition('accepted', 'arrived', 'provider').ok).toBe(false);
    expect(checkJobTransition('arrived', 'en_route', 'provider').ok).toBe(false);
  });

  it('lists next actions per role', () => {
    expect(nextJobStatuses('en_route', 'provider')).toEqual(['arrived', 'cancelled']);
    expect(nextJobStatuses('en_route', 'driver')).toEqual(['cancelled']);
    expect(nextJobStatuses('in_progress', 'driver')).toEqual([]);
  });

  it('treats completed and cancelled as terminal', () => {
    expect(JOB_STATUSES.filter(isTerminalJobStatus)).toEqual(['completed', 'cancelled']);
  });
});
