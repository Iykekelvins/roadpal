/**
 * Delivers login codes. AuthService only talks to this abstract class; which implementation runs
 * is chosen by SMS_MODE (see sms.module.ts), so switching to real SMS is configuration, not code.
 */
export abstract class SmsSender {
  /** Demo mode: the code is returned to the app and shown on screen instead of being texted. */
  abstract readonly showsCode: boolean;
  abstract sendLoginCode(phone: string, code: string): Promise<void>;
}

/**
 * The text of a login-code SMS. Plain GSM-7 characters only: one curly quote or emoji switches
 * the whole message to Unicode, where a page holds 70 characters instead of 160 and costs more.
 */
export const loginCodeMessage = (code: string, minutes: number) =>
  `Your RoadPal code is ${code}. It expires in ${minutes} minutes. Don't share it with anyone.`;
