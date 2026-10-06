import { z } from 'zod';
import type { OfferStatus } from './enums';

/** A pending offer expires after this long: a stale price or ETA shouldn't be accepted. */
export const OFFER_TTL_MINUTES = 5;

export const CreateOfferSchema = z.object({
  priceNaira: z.number().int().min(100, 'Price must be at least ₦100').max(500_000),
  etaMinutes: z.number().int().min(1).max(180, 'ETA must be under 3 hours'),
});
export type CreateOfferInput = z.infer<typeof CreateOfferSchema>;

/** An offer as the driver sees it: everything needed to choose between providers. */
export interface OfferView {
  id: string;
  requestId: string;
  priceNaira: number;
  etaMinutes: number;
  distanceMeters: number;
  status: OfferStatus;
  createdAt: string; // ISO 8601
  provider: {
    id: string;
    name: string | null;
    ratingAvg: number | null;
    ratingCount: number;
  };
}
