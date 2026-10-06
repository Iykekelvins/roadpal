import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CreateOfferInput, OfferView } from '@repo/shared';
import { and, eq, gt, sql, type SQL } from 'drizzle-orm';
import { isUniqueViolation } from '../common/db-errors.js';
import { DB, type Database } from '../db/database.module.js';
import { offers, providerProfiles, requests, users } from '../db/schema.js';
import { findMatchingProviders } from '../matching/find-matching-providers.js';
import { ratingAvg } from '../providers/rating.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';

@Injectable()
export class OffersService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly realtime: RealtimeGateway,
  ) {}

  async create(providerId: string, requestId: string, input: CreateOfferInput): Promise<OfferView> {
    const { offerId, driverId } = await this.db.transaction(async (tx) => {
      // FOR SHARE: concurrent offers can all hold this lock, but an accept (which updates the
      // request) waits for them to finish. So no offer can land after the accept has run.
      const [request] = await tx
        .select()
        .from(requests)
        .where(and(eq(requests.id, requestId), eq(requests.status, 'open'), gt(requests.expiresAt, sql`now()`)))
        .for('share');
      if (!request) throw new NotFoundException('This request is no longer available');

      // Same rules as matching, so only providers who were (or would be) notified can offer.
      const [match] = await findMatchingProviders(tx, { ...request, providerId });
      if (!match) {
        throw new ForbiddenException({
          message: "You can't offer on this request (out of range, offline, or service not offered).",
          code: 'NOT_ELIGIBLE',
        });
      }

      try {
        const [offer] = await tx
          .insert(offers)
          .values({ requestId, providerId, ...input, distanceMeters: match.distanceMeters })
          .returning({ id: offers.id });
        return { offerId: offer!.id, driverId: request.driverId };
      } catch (error) {
        if (isUniqueViolation(error, 'offers_one_per_provider_per_request')) {
          throw new ConflictException({ message: 'You already made an offer on this request.', code: 'OFFER_EXISTS' });
        }
        throw error;
      }
    });

    // After commit, so the driver never sees an offer that was rolled back.
    const [view] = await this.queryViews(eq(offers.id, offerId));
    this.realtime.emitToUser(driverId, 'offer:new', view!);
    return view!;
  }

  async listForDriver(driverId: string, requestId: string) {
    const [owned] = await this.db
      .select({ id: requests.id })
      .from(requests)
      .where(and(eq(requests.id, requestId), eq(requests.driverId, driverId)));
    if (!owned) throw new NotFoundException('Request not found');
    return { offers: await this.queryViews(eq(offers.requestId, requestId)) };
  }

  private async queryViews(where: SQL): Promise<OfferView[]> {
    const rows = await this.db
      .select({
        offer: offers,
        name: users.name,
        ratingSum: providerProfiles.ratingSum,
        ratingCount: providerProfiles.ratingCount,
      })
      .from(offers)
      .innerJoin(users, eq(users.id, offers.providerId))
      .innerJoin(providerProfiles, eq(providerProfiles.userId, offers.providerId))
      .where(where)
      .orderBy(offers.createdAt);

    return rows.map(({ offer, name, ratingSum, ratingCount }) => ({
      id: offer.id,
      requestId: offer.requestId,
      priceNaira: offer.priceNaira,
      etaMinutes: offer.etaMinutes,
      distanceMeters: offer.distanceMeters,
      status: offer.status,
      createdAt: offer.createdAt.toISOString(),
      provider: { id: offer.providerId, name, ratingAvg: ratingAvg(ratingSum, ratingCount), ratingCount },
    }));
  }
}
