import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import {
  CancelJobSchema,
  UpdateJobStatusSchema,
  type CancelJobInput,
  type UpdateJobStatusInput,
} from '@repo/shared';
import { CurrentUser, Roles, type AuthUser } from '../auth/decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
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

  // No @Roles here: who may make each transition is part of the state machine itself.
  @Patch('jobs/:id/status')
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateJobStatusSchema)) body: UpdateJobStatusInput,
  ) {
    return this.jobs.updateStatus(user, id, body);
  }

  @Post('jobs/:id/cancel')
  @HttpCode(200)
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(CancelJobSchema)) body: CancelJobInput,
  ) {
    return this.jobs.cancel(user, id, body);
  }
}
