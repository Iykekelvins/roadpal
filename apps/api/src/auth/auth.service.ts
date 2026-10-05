import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { DB, type Database } from '../db/database.module.js';
import { otpCodes } from '../db/schema.js';
import { generateOtp, hashOtp, OTP_TTL_SECONDS } from './otp.js';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async requestOtp(phone: string) {
    const code = generateOtp();
    const values = {
      codeHash: hashOtp(code),
      expiresAt: new Date(Date.now() + OTP_TTL_SECONDS * 1000),
      attempts: 0,
      createdAt: new Date(),
    };

    await this.db
      .insert(otpCodes)
      .values({ phone, ...values })
      .onConflictDoUpdate({ target: otpCodes.phone, set: values });

    // OTP delivery is mocked: no SMS provider yet. Never expose the code outside development.
    const isDev = this.config.get('NODE_ENV', { infer: true }) === 'development';
    if (isDev) this.logger.log(`OTP for ${phone}: ${code}`);

    return { expiresInSeconds: OTP_TTL_SECONDS, ...(isDev && { devCode: code }) };
  }
}
