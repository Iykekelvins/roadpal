import { z } from 'zod';
import { IssueTypeSchema } from './enums';

export const MAX_SERVICE_RADIUS_KM = 50;

export const ProviderProfileSchema = z.object({
  services: z
    .array(IssueTypeSchema)
    .min(1, 'Pick at least one service')
    .transform((services) => [...new Set(services)]),
  serviceRadiusKm: z.number().int().min(1).max(MAX_SERVICE_RADIUS_KM),
});
export type ProviderProfileInput = z.infer<typeof ProviderProfileSchema>;
