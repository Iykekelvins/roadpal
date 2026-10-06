import { z } from 'zod';
import type { JobStatus, UserRole } from './enums';

/**
 * Every allowed job transition and who may trigger it. Anything not listed is forbidden.
 * The API enforces this; the app reads it to decide which buttons to show.
 */
const TRANSITIONS: Readonly<Record<JobStatus, Partial<Record<JobStatus, readonly UserRole[]>>>> = {
  accepted: { en_route: ['provider'], cancelled: ['driver', 'provider'] },
  en_route: { arrived: ['provider'], cancelled: ['driver', 'provider'] },
  arrived: { in_progress: ['provider'], cancelled: ['driver', 'provider'] },
  // Once work has started, a disagreement is a dispute (admin, later), not a cancellation.
  in_progress: { completed: ['provider'] },
  completed: {},
  cancelled: {},
};

export type JobTransitionCheck =
  | { ok: true }
  | { ok: false; reason: 'INVALID_TRANSITION' | 'NOT_ALLOWED_FOR_ROLE' };

export function checkJobTransition(from: JobStatus, to: JobStatus, role: UserRole): JobTransitionCheck {
  const allowedRoles = TRANSITIONS[from][to];
  if (!allowedRoles) return { ok: false, reason: 'INVALID_TRANSITION' };
  if (!allowedRoles.includes(role)) return { ok: false, reason: 'NOT_ALLOWED_FOR_ROLE' };
  return { ok: true };
}

/** The statuses this role can move a job to from its current status (e.g. to render action buttons). */
export function nextJobStatuses(from: JobStatus, role: UserRole): JobStatus[] {
  return (Object.entries(TRANSITIONS[from]) as [JobStatus, readonly UserRole[]][])
    .filter(([, roles]) => roles.includes(role))
    .map(([to]) => to);
}

export const isTerminalJobStatus = (status: JobStatus): boolean =>
  Object.keys(TRANSITIONS[status]).length === 0;

/** Forward progress updates. Cancelling has its own endpoint because it carries a reason. */
export const JOB_PROGRESS_STATUSES = ['en_route', 'arrived', 'in_progress', 'completed'] as const;
export const UpdateJobStatusSchema = z.object({ status: z.enum(JOB_PROGRESS_STATUSES) });
export type UpdateJobStatusInput = z.infer<typeof UpdateJobStatusSchema>;
