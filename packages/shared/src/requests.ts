import { z } from 'zod';
import { IssueTypeSchema, VehicleTypeSchema } from './enums';
import { LatLngSchema } from './geo';

export const INITIAL_SEARCH_RADIUS_KM = 10;
export const REQUEST_TTL_MINUTES = 10;
/** With no pending offers this long after the last dispatch, the search radius doubles. */
export const WIDEN_AFTER_MINUTES = 3;
export const MAX_SEARCH_RADIUS_KM = 50;
/** Widening guarantees at least this long before the request expires, for the newly reached providers. */
export const WIDEN_MIN_REMAINING_MINUTES = 5;

export const CreateRequestSchema = z.object({
  location: LatLngSchema,
  vehicleType: VehicleTypeSchema,
  issueType: IssueTypeSchema,
  note: z.string().trim().max(280, 'Keep the note under 280 characters').optional(),
});
export type CreateRequestInput = z.infer<typeof CreateRequestSchema>;
