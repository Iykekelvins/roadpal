import { Controller, Get, Inject, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { CurrentUser, type AuthUser } from '../auth/decorators.js';
import { DB, type Database } from '../db/database.module.js';
import { users } from '../db/schema.js';

@Controller('users')
export class UsersController {
  constructor(@Inject(DB) private readonly db: Database) {}

  // Lets the app restore "who am I" on startup from just an access token.
  @Get('me')
  async me(@CurrentUser() current: AuthUser) {
    const [user] = await this.db.select().from(users).where(eq(users.id, current.id));
    if (!user) throw new NotFoundException('User not found');
    return user;
  }
}
