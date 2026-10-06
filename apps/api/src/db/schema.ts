import { ISSUE_TYPES, USER_ROLES } from '@repo/shared';
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
  uuid,
} from 'drizzle-orm/pg-core';
import { geographyPoint } from './geography.js';

export const userRole = pgEnum('user_role', USER_ROLES);
export const issueType = pgEnum('issue_type', ISSUE_TYPES);

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
