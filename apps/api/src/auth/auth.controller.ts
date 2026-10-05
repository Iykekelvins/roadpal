import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  RequestOtpSchema,
  VerifyOtpSchema,
  type RequestOtpInput,
  type VerifyOtpInput,
} from '@repo/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AuthService } from './auth.service.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('otp/request')
  @HttpCode(200)
  requestOtp(@Body(new ZodValidationPipe(RequestOtpSchema)) body: RequestOtpInput) {
    return this.auth.requestOtp(body.phone);
  }

  @Post('otp/verify')
  @HttpCode(200)
  verifyOtp(@Body(new ZodValidationPipe(VerifyOtpSchema)) body: VerifyOtpInput) {
    return this.auth.verifyOtp(body.phone, body.code, body.role);
  }
}
