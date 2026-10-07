import { Body, Controller, HttpCode, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  REFRESH_TOKEN_COOKIE,
  RefreshTokenSchema,
  RequestOtpSchema,
  VerifyOtpSchema,
  type RefreshTokenInput,
  type RequestOtpInput,
  type VerifyOtpInput,
} from '@repo/shared';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import type { Env } from '../config/env.js';
import { AuthService } from './auth.service.js';
import { Public } from './decorators.js';
import { readRefreshCookie, refreshCookieOptions, wantsCookieTransport } from './refresh-cookie.js';

@Public()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Post('otp/request')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  requestOtp(@Body(new ZodValidationPipe(RequestOtpSchema)) body: RequestOtpInput) {
    return this.auth.requestOtp(body.phone);
  }

  // passthrough: we set a cookie on the response but still return the body the normal Nest way.
  @Post('otp/verify')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  async verifyOtp(
    @Body(new ZodValidationPipe(VerifyOtpSchema)) body: VerifyOtpInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.deliver(req, res, await this.auth.verifyOtp(body.phone, body.code, body.role));
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Body(new ZodValidationPipe(RefreshTokenSchema)) body: RefreshTokenInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = body.refreshToken ?? readRefreshCookie(req);
    if (!token) throw new UnauthorizedException('Session expired. Log in again.');
    try {
      return this.deliver(req, res, await this.auth.refresh(token));
    } catch (error) {
      // A dead session shouldn't keep sending a dead cookie.
      if (wantsCookieTransport(req)) this.clearCookie(res);
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Body(new ZodValidationPipe(RefreshTokenSchema)) body: RefreshTokenInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = body.refreshToken ?? readRefreshCookie(req);
    if (token) await this.auth.logout(token);
    this.clearCookie(res);
  }

  /** Cookie transport: refresh token goes in the httpOnly cookie and is removed from the body. */
  private deliver<T extends { refreshToken: string }>(req: Request, res: Response, result: T) {
    if (!wantsCookieTransport(req)) return result;
    const { refreshToken, ...rest } = result;
    res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, refreshCookieOptions(this.cookieEnv()));
    return rest;
  }

  private clearCookie(res: Response) {
    const { maxAge: _maxAge, ...options } = refreshCookieOptions(this.cookieEnv());
    res.clearCookie(REFRESH_TOKEN_COOKIE, options);
  }

  private cookieEnv() {
    return {
      NODE_ENV: this.config.get('NODE_ENV', { infer: true }),
      REFRESH_COOKIE_PATH: this.config.get('REFRESH_COOKIE_PATH', { infer: true }),
    };
  }
}
