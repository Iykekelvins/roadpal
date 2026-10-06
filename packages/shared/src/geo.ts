import { z } from 'zod';

// Always named fields, never [a, b] tuples, so latitude and longitude can't be swapped by accident.
export const LatLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type LatLng = z.infer<typeof LatLngSchema>;
