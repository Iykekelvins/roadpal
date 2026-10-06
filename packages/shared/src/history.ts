import { z } from 'zod';
import type { JobView } from './jobs';

/** "Today" and "this week" are counted in this time zone, not the server's (UTC). */
export const APP_TIMEZONE = 'Africa/Lagos';

export const HistoryQuerySchema = z.object({
  /** Opaque value from the previous page's nextCursor. Omit for the first page. */
  cursor: z.string().min(1).optional(),
  // Query parameters arrive as strings, hence coerce.
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type HistoryQuery = z.infer<typeof HistoryQuerySchema>;

export interface JobHistoryPage {
  items: { job: JobView; myRating: number | null }[];
  /** Pass back as `cursor` for the next page; null when there are no more. */
  nextCursor: string | null;
}

export interface EarningsBucket {
  jobs: number;
  naira: number;
}

export interface EarningsView {
  timezone: string;
  today: EarningsBucket;
  thisWeek: EarningsBucket; // weeks start on Monday
  allTime: EarningsBucket;
}
