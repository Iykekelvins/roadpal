import { BadRequestException } from '@nestjs/common';
import { decodeHistoryCursor, encodeHistoryCursor } from './history-cursor.js';

const cursor = { at: '2026-10-06 15:07:28.345123+00', id: '2dba7f87-1c2b-4c4e-9a52-0f7c6c1e2d3a' };

describe('history cursor', () => {
  it('round-trips without losing microseconds', () => {
    expect(decodeHistoryCursor(encodeHistoryCursor(cursor))).toEqual(cursor);
  });

  it('is opaque (not readable JSON) to clients', () => {
    expect(encodeHistoryCursor(cursor)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it.each([
    ['garbage', 'not-a-cursor!!'],
    ['valid base64, not JSON', Buffer.from('hello').toString('base64url')],
    ['bad timestamp (SQL injection attempt)', encodeHistoryCursor({ ...cursor, at: "x'); drop table jobs;--" })],
    ['bad id', encodeHistoryCursor({ ...cursor, id: '42' })],
  ])('rejects %s with 400', (_label, value) => {
    expect(() => decodeHistoryCursor(value)).toThrow(BadRequestException);
  });
});
