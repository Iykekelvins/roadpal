import { Body, Controller, Get, Put } from '@nestjs/common';
import { ProviderProfileSchema, type ProviderProfileInput } from '@repo/shared';
import { CurrentUser, Roles, type AuthUser } from '../auth/decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ProvidersService } from './providers.service.js';

@Roles('provider')
@Controller('providers')
export class ProvidersController {
  constructor(private readonly providers: ProvidersService) {}

  @Get('me/profile')
  getProfile(@CurrentUser() user: AuthUser) {
    return this.providers.getProfile(user.id);
  }

  @Put('me/profile')
  upsertProfile(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(ProviderProfileSchema)) body: ProviderProfileInput,
  ) {
    return this.providers.upsertProfile(user.id, body);
  }
}
