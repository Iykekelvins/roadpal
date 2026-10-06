import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ACTIVE_JOB_STATUSES,
  checkJobTransition,
  type JobStatus,
  type JobView,
  type UpdateJobStatusInput,
} from '@repo/shared';
import { and, eq, gt, inArray, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { AuthUser } from '../auth/decorators.js';
import { isUniqueViolation, retryOnDeadlock } from '../common/db-errors.js';
import { DB, type Database } from '../db/database.module.js';
import { jobs, offers, providerProfiles, requests, users } from '../db/schema.js';
import { ratingAvg } from '../providers/rating.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';

const driverUser = alias(users, 'driver_user');
type JobInsert = typeof jobs.$inferInsert;

/** Which timestamp column records reaching each status. */
const STATUS_TIMESTAMP: Record<Exclude<JobStatus, 'accepted'>, keyof JobInsert> = {
  en_route: 'enRouteAt',
  arrived: 'arrivedAt',
  in_progress: 'startedAt',
  completed: 'completedAt',
  cancelled: 'cancelledAt',
};

const providerUser = alias(users, 'provider_user');

@Injectable()
export class JobsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly realtime: RealtimeGateway,
  ) {}

  async acceptOffer(driverId: string, offerId: string): Promise<JobView> {
    const outcome = await retryOnDeadlock(() => this.db.transaction(async (tx) => {
      const [offer] = await tx.select().from(offers).where(eq(offers.id, offerId));
      if (!offer) throw new NotFoundException('Offer not found');

      // 0. Lock the provider first. Every accept takes locks in the same order (provider, then
      //    request, then offers), so two accepts of the same provider queue here instead of
      //    deadlocking on each other's offers. The second then finds its offer withdrawn.
      await tx
        .select({ id: providerProfiles.userId })
        .from(providerProfiles)
        .where(eq(providerProfiles.userId, offer.providerId))
        .for('update');

      // 1. Claim the request (open -> matched). This takes the row lock: a second accept on the
      //    same request waits here until we commit, then finds it no longer open.
      const [claimed] = await tx
        .update(requests)
        .set({ status: 'matched' })
        .where(
          and(
            eq(requests.id, offer.requestId),
            eq(requests.driverId, driverId),
            eq(requests.status, 'open'),
            gt(requests.expiresAt, sql`now()`),
          ),
        )
        .returning({ id: requests.id });
      if (!claimed) {
        const [owned] = await tx
          .select({ id: requests.id })
          .from(requests)
          .where(and(eq(requests.id, offer.requestId), eq(requests.driverId, driverId)));
        if (!owned) throw new NotFoundException('Offer not found');
        throw new ConflictException({ message: 'This request is no longer open.', code: 'REQUEST_NOT_OPEN' });
      }

      const now = new Date();
      // 2. This offer -> accepted (it may have been withdrawn if the provider took another job).
      const [accepted] = await tx
        .update(offers)
        .set({ status: 'accepted', updatedAt: now })
        .where(and(eq(offers.id, offerId), eq(offers.status, 'pending')))
        .returning({ id: offers.id });
      if (!accepted) {
        throw new ConflictException({ message: 'This offer is no longer available.', code: 'OFFER_NOT_PENDING' });
      }

      // 3. Every other offer on this request -> rejected.
      const rejected = await tx
        .update(offers)
        .set({ status: 'rejected', updatedAt: now })
        .where(and(eq(offers.requestId, offer.requestId), eq(offers.status, 'pending')))
        .returning({ id: offers.id, providerId: offers.providerId });

      // 4. The winner's pending offers elsewhere -> withdrawn: they're busy now.
      const withdrawn = await tx
        .update(offers)
        .set({ status: 'withdrawn', updatedAt: now })
        .where(and(eq(offers.providerId, offer.providerId), eq(offers.status, 'pending')))
        .returning({ id: offers.id, requestId: offers.requestId });

      // 5. Create the job. If the provider was hired elsewhere a moment ago, the partial unique
      //    index rejects this and the whole transaction (steps 1-4) rolls back.
      try {
        const [job] = await tx
          .insert(jobs)
          .values({ requestId: offer.requestId, offerId, providerId: offer.providerId })
          .returning({ id: jobs.id });
        return { jobId: job!.id, requestId: offer.requestId, rejected, withdrawn };
      } catch (error) {
        if (isUniqueViolation(error, 'jobs_one_active_per_provider')) {
          throw new ConflictException({
            message: 'This provider just took another job. Please choose another offer.',
            code: 'PROVIDER_BUSY',
          });
        }
        throw error;
      }
    }));

    // Notifications only after commit.
    const job = (await this.findViews(eq(jobs.id, outcome.jobId)))[0]!;
    this.realtime.emitToUser(job.provider.id, 'offer:accepted', job);
    for (const { id, providerId } of outcome.rejected) {
      this.realtime.emitToUser(providerId, 'offer:rejected', { offerId: id, requestId: outcome.requestId });
    }
    if (outcome.withdrawn.length) {
      const affected = await this.db
        .select({ id: requests.id, driverId: requests.driverId })
        .from(requests)
        .where(inArray(requests.id, outcome.withdrawn.map((w) => w.requestId)));
      const driverOf = new Map(affected.map((r) => [r.id, r.driverId]));
      for (const { id, requestId } of outcome.withdrawn) {
        this.realtime.emitToUser(driverOf.get(requestId)!, 'offer:withdrawn', { offerId: id, requestId });
      }
    }
    return job;
  }

  async updateStatus(user: AuthUser, jobId: string, { status: to }: UpdateJobStatusInput): Promise<JobView> {
    await this.db.transaction(async (tx) => {
      const [current] = await tx
        .select({ status: jobs.status, requestId: jobs.requestId })
        .from(jobs)
        .innerJoin(requests, eq(requests.id, jobs.requestId))
        .where(and(eq(jobs.id, jobId), this.participant(user)));
      if (!current) throw new NotFoundException('Job not found');

      const check = checkJobTransition(current.status, to, user.role);
      if (!check.ok) {
        const body = { message: `Can't move a job from ${current.status} to ${to}.`, code: check.reason };
        throw check.reason === 'NOT_ALLOWED_FOR_ROLE' ? new ForbiddenException(body) : new ConflictException(body);
      }

      // Compare-and-set: only update if the status is still what we just checked against.
      const [updated] = await tx
        .update(jobs)
        .set({ status: to, [STATUS_TIMESTAMP[to]]: new Date() })
        .where(and(eq(jobs.id, jobId), eq(jobs.status, current.status)))
        .returning({ id: jobs.id });
      if (!updated) {
        throw new ConflictException({ message: 'This job was just updated. Refresh and try again.', code: 'JOB_CHANGED' });
      }

      if (to === 'completed') {
        await tx.update(requests).set({ status: 'resolved' }).where(eq(requests.id, current.requestId));
      }
    });

    const [job] = await this.findViews(eq(jobs.id, jobId));
    this.emitToParticipants(job!, 'job:updated');
    return job!;
  }

  private emitToParticipants(job: JobView, event: 'job:updated') {
    this.realtime.emitToUser(job.driver.id, event, job);
    this.realtime.emitToUser(job.provider.id, event, job);
  }

  async findActive(user: AuthUser) {
    const [job] = await this.findViews(
      and(this.participant(user), inArray(jobs.status, [...ACTIVE_JOB_STATUSES]))!,
    );
    return { job: job ?? null };
  }

  async findOne(user: AuthUser, jobId: string) {
    const [job] = await this.findViews(and(eq(jobs.id, jobId), this.participant(user))!);
    // Same 404 for "doesn't exist" and "not yours".
    if (!job) throw new NotFoundException('Job not found');
    return job;
  }

  private participant(user: AuthUser): SQL {
    return user.role === 'driver' ? eq(requests.driverId, user.id) : eq(jobs.providerId, user.id);
  }

  private async findViews(where: SQL): Promise<JobView[]> {
    const rows = await this.db
      .select({
        job: jobs,
        priceNaira: offers.priceNaira,
        etaMinutes: offers.etaMinutes,
        location: requests.location,
        vehicleType: requests.vehicleType,
        issueType: requests.issueType,
        note: requests.note,
        driver: { id: driverUser.id, name: driverUser.name, phone: driverUser.phone },
        provider: { id: providerUser.id, name: providerUser.name, phone: providerUser.phone },
        ratingSum: providerProfiles.ratingSum,
        ratingCount: providerProfiles.ratingCount,
      })
      .from(jobs)
      .innerJoin(offers, eq(offers.id, jobs.offerId))
      .innerJoin(requests, eq(requests.id, jobs.requestId))
      .innerJoin(driverUser, eq(driverUser.id, requests.driverId))
      .innerJoin(providerUser, eq(providerUser.id, jobs.providerId))
      .innerJoin(providerProfiles, eq(providerProfiles.userId, jobs.providerId))
      .where(where)
      .orderBy(sql`${jobs.acceptedAt} desc`);

    return rows.map(({ job, ratingSum, ratingCount, provider, ...rest }) => ({
      id: job.id,
      status: job.status,
      requestId: job.requestId,
      offerId: job.offerId,
      priceNaira: rest.priceNaira,
      etaMinutes: rest.etaMinutes,
      location: rest.location,
      vehicleType: rest.vehicleType,
      issueType: rest.issueType,
      note: rest.note,
      acceptedAt: job.acceptedAt.toISOString(),
      enRouteAt: job.enRouteAt?.toISOString() ?? null,
      arrivedAt: job.arrivedAt?.toISOString() ?? null,
      startedAt: job.startedAt?.toISOString() ?? null,
      completedAt: job.completedAt?.toISOString() ?? null,
      cancelledAt: job.cancelledAt?.toISOString() ?? null,
      driver: rest.driver,
      provider: { ...provider, ratingAvg: ratingAvg(ratingSum, ratingCount), ratingCount },
    }));
  }
}
