import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { CurrentUser, Roles, type AuthUser } from '../auth/decorators.js';
import { JobsService } from './jobs.service.js';

@Controller()
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Roles('driver')
  @Post('offers/:offerId/accept')
  @HttpCode(201)
  accept(@CurrentUser() user: AuthUser, @Param('offerId', ParseUUIDPipe) offerId: string) {
    return this.jobs.acceptOffer(user.id, offerId);
  }

  // Both participants: restore the current job after a restart or reconnect.
  @Get('jobs/active')
  active(@CurrentUser() user: AuthUser) {
    return this.jobs.findActive(user);
  }

  @Get('jobs/:id')
  findOne(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.jobs.findOne(user, id);
  }
}
