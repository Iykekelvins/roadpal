import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { CreateRequestSchema, type CreateRequestInput } from '@repo/shared';
import { CurrentUser, Roles, type AuthUser } from '../auth/decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { RequestsService } from './requests.service.js';

@Roles('driver')
@Controller('requests')
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(CreateRequestSchema)) body: CreateRequestInput,
  ) {
    return this.requests.create(user.id, body);
  }

  // Lets the app restore an in-progress request after a restart or reconnect.
  @Get('active')
  async active(@CurrentUser() user: AuthUser) {
    return { request: await this.requests.findActive(user.id) };
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.requests.findOwned(user.id, id);
  }

  // Only while still open. Once an offer is accepted it's a job, cancelled via POST /jobs/:id/cancel.
  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.requests.cancel(user.id, id);
  }
}
