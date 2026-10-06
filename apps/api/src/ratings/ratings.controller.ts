import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { RateJobSchema, type RateJobInput } from '@repo/shared';
import { CurrentUser, type AuthUser } from '../auth/decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { RatingsService } from './ratings.service.js';

@Controller()
export class RatingsController {
  constructor(private readonly ratings: RatingsService) {}

  // Either participant rates the other once the job is completed.
  @Post('jobs/:id/rating')
  rate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) jobId: string,
    @Body(new ZodValidationPipe(RateJobSchema)) body: RateJobInput,
  ) {
    return this.ratings.rate(user, jobId, body);
  }
}
