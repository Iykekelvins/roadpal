import { integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
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
