import { index, integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { USER_ROLES } from '@repo/shared';

export const userRole = pgEnum('user_role', USER_ROLES);

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
