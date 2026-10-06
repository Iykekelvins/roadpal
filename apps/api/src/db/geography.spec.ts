import { parseEwkbPoint, toEwkt } from './geography.js';

const LAGOS = { lat: 6.5244, lng: 3.3792 };
// Real value returned by Postgres for 'SRID=4326;POINT(3.3792 6.5244)'::geography
const LAGOS_EWKB = '0101000020E6100000462575029A080B40F0164850FC181A40';

describe('geography helpers', () => {
  it('writes longitude before latitude for PostGIS', () => {
    expect(toEwkt(LAGOS)).toBe('SRID=4326;POINT(3.3792 6.5244)');
  });

  it('parses the EWKB Postgres returns back into lat/lng', () => {
    expect(parseEwkbPoint(LAGOS_EWKB)).toEqual(LAGOS);
  });

  it('round-trips without swapping coordinates', () => {
    const point = parseEwkbPoint(LAGOS_EWKB);
    expect(toEwkt(point)).toBe(toEwkt(LAGOS));
  });
});
