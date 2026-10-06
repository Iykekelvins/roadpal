import { Body, Controller, Get, HttpCode, Patch, Post, Put } from '@nestjs/common';
import {
  LocationUpdateSchema,
  ProviderProfileSchema,
  ProviderStatusSchema,
  type LocationUpdateInput,
  type ProviderProfileInput,
  type ProviderStatusInput,
} from '@repo/shared';
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

  @Patch('me/status')
  setStatus(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(ProviderStatusSchema)) body: ProviderStatusInput,
  ) {
    return this.providers.setStatus(user.id, body);
  }

  @Post('me/location')
  @HttpCode(200)
  updateLocation(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(LocationUpdateSchema)) body: LocationUpdateInput,
  ) {
    return this.providers.updateLocation(user.id, body);
  }
}
