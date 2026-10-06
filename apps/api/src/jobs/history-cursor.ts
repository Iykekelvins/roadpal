import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

/**
 * Position after which the next page starts: (accepted_at, id) of the last item seen.
 * `at` is Postgres's own text form of the timestamp, NOT a JS Date: Postgres keeps microseconds,
 * Date only milliseconds, and a rounded cursor would silently skip rows at page boundaries.
 */
export interface HistoryCursor {
  at: string;
  id: string;
}

const CursorSchema = z.object({
  // e.g. "2026-10-06 15:07:28.345123+00", as produced by `accepted_at::text`
  at: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?[+-]\d{2}(:\d{2})?$/),
  id: z.uuid(),
});

// Opaque to clients (they just pass it back), so the format can change without breaking them.
export const encodeHistoryCursor = (cursor: HistoryCursor): string =>
  Buffer.from(JSON.stringify(cursor)).toString('base64url');

export function decodeHistoryCursor(value: string): HistoryCursor {
  try {
    return CursorSchema.parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
  } catch {
    throw new BadRequestException({ message: 'Invalid cursor', code: 'INVALID_CURSOR' });
  }
}
