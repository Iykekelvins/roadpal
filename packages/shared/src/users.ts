import { z } from 'zod';

export const UpdateMeSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(60, 'Name is too long'),
});
export type UpdateMeInput = z.infer<typeof UpdateMeSchema>;
