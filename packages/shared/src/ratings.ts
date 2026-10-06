import { z } from 'zod';

export const RateJobSchema = z.object({
  score: z.number().int().min(1, 'Score must be 1 to 5').max(5, 'Score must be 1 to 5'),
  comment: z.string().trim().max(500, 'Keep the comment under 500 characters').optional(),
});
export type RateJobInput = z.infer<typeof RateJobSchema>;

export interface RatingView {
  id: string;
  jobId: string;
  score: number;
  comment: string | null;
  createdAt: string; // ISO 8601
}
