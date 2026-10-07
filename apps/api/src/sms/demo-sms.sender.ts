import { Injectable, Logger } from '@nestjs/common';
import { SmsSender } from './sms-sender.js';

/** Sends nothing: the code is logged and shown in the app. Free, but proves nothing about the phone. */
@Injectable()
export class DemoSmsSender extends SmsSender {
  readonly showsCode = true;
  private readonly logger = new Logger('SMS (demo)');

  async sendLoginCode(phone: string, code: string) {
    this.logger.log(`Login code for ${phone}: ${code}`);
  }
}
