import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import type { Env } from '../config/env.js';
import { SmsModule } from '../sms/sms.module.js';
import { ACCESS_TOKEN_TTL_SECONDS } from './access-token.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { RolesGuard } from './roles.guard.js';

@Module({
  imports: [
    SmsModule,
    // Per-IP burst limit for the login-code endpoints (applied with @UseGuards there, not globally).
    // Generous on purpose: Nigerian mobile networks put many users behind one shared IP (CGNAT).
    // The real limits are per phone number and per day, in the database (see AuthService).
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 30 }],
      errorMessage: 'Too many attempts from your network. Wait a minute and try again.',
    }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_ACCESS_SECRET', { infer: true }),
        signOptions: { expiresIn: ACCESS_TOKEN_TTL_SECONDS },
      }),
    }),
  ],
  controllers: [AuthController],
  exports: [JwtModule],
  providers: [
    AuthService,
    // Global guards run in registration order: authenticate first, then check roles.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}
