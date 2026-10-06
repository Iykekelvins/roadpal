import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { CreateOfferSchema, type CreateOfferInput } from '@repo/shared';
import { CurrentUser, Roles, type AuthUser } from '../auth/decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { OffersService } from './offers.service.js';

@Controller()
export class OffersController {
  constructor(private readonly offers: OffersService) {}

  @Roles('provider')
  @Post('requests/:requestId/offers')
  create(
    @CurrentUser() user: AuthUser,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body(new ZodValidationPipe(CreateOfferSchema)) body: CreateOfferInput,
  ) {
    return this.offers.create(user.id, requestId, body);
  }

  // REST catch-up for offer:new pushes (e.g. after the driver's app reconnects).
  @Roles('driver')
  @Get('requests/:requestId/offers')
  list(@CurrentUser() user: AuthUser, @Param('requestId', ParseUUIDPipe) requestId: string) {
    return this.offers.listForDriver(user.id, requestId);
  }
}
