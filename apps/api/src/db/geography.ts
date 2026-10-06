import type { LatLng } from '@repo/shared';
import { customType } from 'drizzle-orm/pg-core';

const SRID_WGS84 = 4326; // the GPS coordinate system
const EWKB_SRID_FLAG = 0x20000000;
const WKB_POINT = 1;

// PostGIS text input expects longitude first (x, y). This is the only place that order is written.
export const toEwkt = ({ lat, lng }: LatLng): string => `SRID=${SRID_WGS84};POINT(${lng} ${lat})`;

// Postgres returns geography values as hex-encoded EWKB: byte order, type (+SRID flag), [SRID], x, y.
export function parseEwkbPoint(hex: string): LatLng {
  const buf = Buffer.from(hex, 'hex');
  const littleEndian = buf.readUInt8(0) === 1;
  const readUInt32 = (offset: number) => (littleEndian ? buf.readUInt32LE(offset) : buf.readUInt32BE(offset));
  const readDouble = (offset: number) => (littleEndian ? buf.readDoubleLE(offset) : buf.readDoubleBE(offset));

  const type = readUInt32(1);
  if ((type & 0xff) !== WKB_POINT) throw new Error(`Expected a POINT, got WKB type ${type}`);
  const offset = type & EWKB_SRID_FLAG ? 9 : 5; // skip the SRID if present
  return { lng: readDouble(offset), lat: readDouble(offset + 8) };
}

/** geography(Point, 4326): distances computed on it are in metres on the Earth's surface. */
export const geographyPoint = customType<{ data: LatLng; driverData: string }>({
  dataType: () => `geography(Point, ${SRID_WGS84})`,
  toDriver: toEwkt,
  fromDriver: parseEwkbPoint,
});
