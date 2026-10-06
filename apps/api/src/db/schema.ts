import {
  ACTIVE_JOB_STATUSES,
  ACTIVE_REQUEST_STATUSES,
  INITIAL_SEARCH_RADIUS_KM,
  ISSUE_TYPES,
  JOB_STATUSES,
  OFFER_STATUSES,
  REQUEST_STATUSES,
  USER_ROLES,
  VEHICLE_TYPES,
} from '@repo/shared';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { geographyPoint } from './geography.js';

// Literal values (not query parameters): partial index definitions live in migration SQL.
const statusIn = (statuses: readonly string[]) =>
  sql.raw(`status in (${statuses.map((s) => `'${s}'`).join(', ')})`);

export const userRole = pgEnum('user_role', USER_ROLES);
export const issueType = pgEnum('issue_type', ISSUE_TYPES);
export const vehicleType = pgEnum('vehicle_type', VEHICLE_TYPES);
export const requestStatus = pgEnum('request_status', REQUEST_STATUSES);
export const offerStatus = pgEnum('offer_status', OFFER_STATUSES);
export const jobStatus = pgEnum('job_status', JOB_STATUSES);

export const users = pgTable('users', {
  id: uuid().primaryKey().defaultRandom(),
  // Canonical +234... form from PhoneSchema, so the unique constraint catches duplicates.
  phone: text().notNull().unique(),
  role: userRole().notNull(),
  name: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

// One active code per phone: requesting a new code overwrites the old one.
export const otpCodes = pgTable('otp_codes', {
  phone: text().primaryKey(),
  codeHash: text().notNull(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  attempts: integer().notNull().default(0),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

// Opaque refresh tokens (only the hash is stored). All tokens rotated from one login share a familyId.
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    familyId: uuid().notNull(),
    tokenHash: text().notNull().unique(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    revokedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.familyId), index().on(t.userId)],
);

export const providerProfiles = pgTable(
  'provider_profiles',
  {
    userId: uuid()
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Same values as a request's issue type, so matching is a direct "can handle this?" check.
    services: issueType().array().notNull(),
    serviceRadiusKm: integer().notNull().default(10),
    isOnline: boolean().notNull().default(false),
    lastLocation: geographyPoint(),
    lastLocationAt: timestamp({ withTimezone: true }),
    // Sum + count instead of a stored average: both update atomically and nothing drifts from rounding.
    ratingSum: integer().notNull().default(0),
    ratingCount: integer().notNull().default(0),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // GiST indexes 2D space, so radius searches skip far-away providers instead of scanning all.
    index().using('gist', t.lastLocation),
    check('service_radius_km_range', sql`${t.serviceRadiusKm} between 1 and 50`),
  ],
);

// A driver's need for help. Jobs (a provider's attempt to fix it) come later and reference this.
export const requests = pgTable(
  'requests',
  {
    id: uuid().primaryKey().defaultRandom(),
    driverId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    location: geographyPoint().notNull(),
    vehicleType: vehicleType().notNull(),
    issueType: issueType().notNull(),
    note: text(),
    status: requestStatus().notNull().default('open'),
    searchRadiusKm: integer().notNull().default(INITIAL_SEARCH_RADIUS_KM),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [
    index().using('gist', t.location),
    // One active request per driver, enforced by the database so concurrent creates can't both succeed.
    uniqueIndex('requests_one_active_per_driver')
      .on(t.driverId)
      .where(statusIn(ACTIVE_REQUEST_STATUSES)),
  ],
);

export const offers = pgTable(
  'offers',
  {
    id: uuid().primaryKey().defaultRandom(),
    requestId: uuid()
      .notNull()
      .references(() => requests.id, { onDelete: 'cascade' }),
    providerId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    priceNaira: integer().notNull(),
    etaMinutes: integer().notNull(),
    // Snapshot at offer time: the driver compares what each provider claimed when they offered.
    distanceMeters: integer().notNull(),
    status: offerStatus().notNull().default('pending'),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One offer per provider per request. Leading request_id also serves "offers for request X".
    uniqueIndex('offers_one_per_provider_per_request').on(t.requestId, t.providerId),
    check('offers_price_positive', sql`${t.priceNaira} > 0`),
    check('offers_eta_positive', sql`${t.etaMinutes} > 0`),
  ],
);

// One provider's attempt to fix a request. A request can have several over time (e.g. a no-show
// is cancelled and the driver picks someone else), but only one active at once.
export const jobs = pgTable(
  'jobs',
  {
    id: uuid().primaryKey().defaultRandom(),
    requestId: uuid()
      .notNull()
      .references(() => requests.id, { onDelete: 'cascade' }),
    offerId: uuid()
      .notNull()
      .unique()
      .references(() => offers.id, { onDelete: 'cascade' }),
    providerId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: jobStatus().notNull().default('accepted'),
    acceptedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    enRouteAt: timestamp({ withTimezone: true }),
    arrivedAt: timestamp({ withTimezone: true }),
    startedAt: timestamp({ withTimezone: true }),
    completedAt: timestamp({ withTimezone: true }),
    cancelledAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    uniqueIndex('jobs_one_active_per_request').on(t.requestId).where(statusIn(ACTIVE_JOB_STATUSES)),
    uniqueIndex('jobs_one_active_per_provider').on(t.providerId).where(statusIn(ACTIVE_JOB_STATUSES)),
  ],
);
