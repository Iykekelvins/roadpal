import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { RateJobInput, RatingView } from '@repo/shared';
import { and, eq, or, sql } from 'drizzle-orm';
import type { AuthUser } from '../auth/decorators.js';
import { isUniqueViolation } from '../common/db-errors.js';
import { DB, type Database } from '../db/database.module.js';
import { jobs, providerProfiles, ratings, requests } from '../db/schema.js';

@Injectable()
export class RatingsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async rate(user: AuthUser, jobId: string, input: RateJobInput): Promise<RatingView> {
    return this.db.transaction(async (tx) => {
      const [job] = await tx
        .select({ status: jobs.status, providerId: jobs.providerId, driverId: requests.driverId })
        .from(jobs)
        .innerJoin(requests, eq(requests.id, jobs.requestId))
        .where(and(eq(jobs.id, jobId), or(eq(jobs.providerId, user.id), eq(requests.driverId, user.id))));
      if (!job) throw new NotFoundException('Job not found');
      if (job.status !== 'completed') {
        throw new ConflictException({ message: 'Only completed jobs can be rated.', code: 'JOB_NOT_COMPLETED' });
      }

      // The person being rated comes from the job, never from the client.
      const toUserId = user.id === job.driverId ? job.providerId : job.driverId;

      let rating: typeof ratings.$inferSelect;
      try {
        [rating] = (await tx
          .insert(ratings)
          .values({ jobId, fromUserId: user.id, toUserId, score: input.score, comment: input.comment ?? null })
          .returning()) as [typeof ratings.$inferSelect];
      } catch (error) {
        if (isUniqueViolation(error, 'ratings_one_per_person_per_job')) {
          throw new ConflictException({ message: 'You already rated this job.', code: 'ALREADY_RATED' });
        }
        throw error;
      }

      // Same transaction as the insert, and the arithmetic happens in Postgres: concurrent ratings
      // can't overwrite each other, and a rejected duplicate never touches the counters.
      if (toUserId === job.providerId) {
        await tx
          .update(providerProfiles)
          .set({
            ratingSum: sql`${providerProfiles.ratingSum} + ${input.score}`,
            ratingCount: sql`${providerProfiles.ratingCount} + 1`,
          })
          .where(eq(providerProfiles.userId, job.providerId));
      }

      return {
        id: rating.id,
        jobId: rating.jobId,
        score: rating.score,
        comment: rating.comment,
        createdAt: rating.createdAt.toISOString(),
      };
    });
  }
}
