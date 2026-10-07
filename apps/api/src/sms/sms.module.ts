import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { DemoSmsSender } from './demo-sms.sender.js';
import { SmsSender } from './sms-sender.js';
import { TermiiSmsSender } from './termii-sms.sender.js';

@Module({
  providers: [
    {
      provide: SmsSender,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): SmsSender => {
        if (config.get('SMS_MODE', { infer: true }) === 'demo') return new DemoSmsSender();
        // The env schema guarantees these are set when SMS_MODE=termii.
        return new TermiiSmsSender({
          apiKey: config.get('TERMII_API_KEY', { infer: true })!,
          baseUrl: config.get('TERMII_BASE_URL', { infer: true })!,
          senderId: config.get('TERMII_SENDER_ID', { infer: true }),
        });
      },
    },
  ],
  exports: [SmsSender],
})
export class SmsModule {}
