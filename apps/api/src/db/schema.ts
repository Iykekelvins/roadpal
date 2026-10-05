import { pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
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
