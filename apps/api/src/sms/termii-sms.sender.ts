import { Logger } from '@nestjs/common';
import { OTP_TTL_SECONDS } from '../auth/otp.js';
import { loginCodeMessage, SmsSender } from './sms-sender.js';

export interface TermiiConfig {
  apiKey: string;
  /** Account-specific, from the Termii dashboard, e.g. https://v3.api.termii.com */
  baseUrl: string;
  senderId: string;
}

/** Real SMS through Termii, on the DND route (Termii: the generic route is unreliable for OTPs). */
export class TermiiSmsSender extends SmsSender {
  readonly showsCode = false;
  private readonly logger = new Logger('SMS (Termii)');

  constructor(
    private readonly config: TermiiConfig,
    private readonly fetchFn: typeof fetch = fetch,
  ) {
    super();
  }

  async sendLoginCode(phone: string, code: string) {
    const res = await this.fetchFn(new URL('/api/sms/send', this.config.baseUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: this.config.apiKey,
        to: phone.replace(/^\+/, ''), // Termii wants 2348012345678, no plus
        from: this.config.senderId,
        sms: loginCodeMessage(code, OTP_TTL_SECONDS / 60),
        type: 'plain',
        channel: 'dnd',
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json().catch(() => null)) as { code?: string; message?: string } | null;
    if (!res.ok || body?.code !== 'ok') {
      // Log the provider's reason (never the code or key); the caller shows a generic message.
      this.logger.error(`Send failed (${res.status}): ${body?.message ?? 'no details'}`);
      throw new Error('SMS_SEND_FAILED');
    }
  }
}
