import { z } from 'zod';
import { IssueTypeSchema, VehicleTypeSchema } from './enums';
import { LatLngSchema } from './geo';

export const INITIAL_SEARCH_RADIUS_KM = 10;
export const REQUEST_TTL_MINUTES = 10;

export const CreateRequestSchema = z.object({
  location: LatLngSchema,
  vehicleType: VehicleTypeSchema,
  issueType: IssueTypeSchema,
  note: z.string().trim().max(280, 'Keep the note under 280 characters').optional(),
});
export type CreateRequestInput = z.infer<typeof CreateRequestSchema>;
