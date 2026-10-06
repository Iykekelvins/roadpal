import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  RefreshTokenSchema,
  RequestOtpSchema,
  VerifyOtpSchema,
  type RefreshTokenInput,
  type RequestOtpInput,
  type VerifyOtpInput,
} from '@repo/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AuthService } from './auth.service.js';
import { Public } from './decorators.js';

@Public()
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

  @Post('refresh')
  @HttpCode(200)
  refresh(@Body(new ZodValidationPipe(RefreshTokenSchema)) body: RefreshTokenInput) {
    return this.auth.refresh(body.refreshToken);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Body(new ZodValidationPipe(RefreshTokenSchema)) body: RefreshTokenInput) {
    await this.auth.logout(body.refreshToken);
  }
}
