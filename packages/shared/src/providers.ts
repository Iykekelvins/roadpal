import { z } from 'zod';
import { IssueTypeSchema } from './enums';
import { LatLngSchema } from './geo';

export const MAX_SERVICE_RADIUS_KM = 50;
/** How often an online, idle provider's app should send its location. */
export const IDLE_LOCATION_INTERVAL_SECONDS = 30;
/** The server ignores location updates closer together than this. */
export const MIN_LOCATION_INTERVAL_SECONDS = 10;

export const ProviderProfileSchema = z.object({
  services: z
    .array(IssueTypeSchema)
    .min(1, 'Pick at least one service')
    .transform((services) => [...new Set(services)]),
  serviceRadiusKm: z.number().int().min(1).max(MAX_SERVICE_RADIUS_KM),
});
export type ProviderProfileInput = z.infer<typeof ProviderProfileSchema>;

// Going online requires a location; going offline needs nothing else.
export const ProviderStatusSchema = z.discriminatedUnion('isOnline', [
  z.object({ isOnline: z.literal(true), location: LatLngSchema }),
  z.object({ isOnline: z.literal(false) }),
]);
export type ProviderStatusInput = z.infer<typeof ProviderStatusSchema>;

export const LocationUpdateSchema = LatLngSchema;
export type LocationUpdateInput = z.infer<typeof LocationUpdateSchema>;
