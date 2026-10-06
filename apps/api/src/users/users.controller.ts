import { Body, Controller, Get, Inject, NotFoundException, Patch } from '@nestjs/common';
import { UpdateMeSchema, type UpdateMeInput } from '@repo/shared';
import { eq } from 'drizzle-orm';
import { CurrentUser, type AuthUser } from '../auth/decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
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

  // Only user-editable fields are accepted; phone and role can't be changed here.
  @Patch('me')
  async updateMe(
    @CurrentUser() current: AuthUser,
    @Body(new ZodValidationPipe(UpdateMeSchema)) body: UpdateMeInput,
  ) {
    const [user] = await this.db
      .update(users)
      .set({ name: body.name })
      .where(eq(users.id, current.id))
      .returning();
    if (!user) throw new NotFoundException('User not found');
    return user;
  }
}
