import { validateEnv } from '../config/env.js';
import { loginCodeMessage } from './sms-sender.js';
import { TermiiSmsSender } from './termii-sms.sender.js';

// The GSM-7 basic character set: anything outside it makes the SMS Unicode (70 chars per page).
const GSM7 = /^[@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\-./0-9:;<=>?¡A-ZÄÖÑÜ§¿a-zäöñüà]*$/;

describe('loginCodeMessage', () => {
  it('fits in one plain (GSM-7) SMS page', () => {
    const text = loginCodeMessage('123456', 5);
    expect(text).toMatch(GSM7);
    expect(text.length).toBeLessThanOrEqual(160);
    expect(text).toContain('123456');
  });
});

describe('TermiiSmsSender', () => {
  const config = { apiKey: 'key-123', baseUrl: 'https://v3.api.termii.com', senderId: 'RoadPal' };
  const respond = (status: number, body: unknown) =>
    vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body), { status }));

  it('sends on the DND route, in the number format Termii expects', async () => {
    const fetchFn = respond(200, { code: 'ok', message: 'Successfully Sent' });
    await new TermiiSmsSender(config, fetchFn).sendLoginCode('+2348031234567', '654321');

    const [url, init] = fetchFn.mock.calls[0]!;
    expect((url as URL).href).toBe('https://v3.api.termii.com/api/sms/send');
    expect(JSON.parse(init!.body as string)).toEqual({
      api_key: 'key-123',
      to: '2348031234567',
      from: 'RoadPal',
      sms: loginCodeMessage('654321', 5),
      type: 'plain',
      channel: 'dnd',
    });
  });

  it('throws when Termii rejects the message, even with HTTP 200', async () => {
    const sender = new TermiiSmsSender(config, respond(200, { code: 'error', message: 'Insufficient balance' }));
    await expect(sender.sendLoginCode('+2348031234567', '111111')).rejects.toThrow('SMS_SEND_FAILED');
  });

  it('throws on HTTP errors', async () => {
    const sender = new TermiiSmsSender(config, respond(401, { message: 'Invalid api key' }));
    await expect(sender.sendLoginCode('+2348031234567', '111111')).rejects.toThrow('SMS_SEND_FAILED');
  });
});

describe('SMS settings', () => {
  const base = { DATABASE_URL: 'postgres://u:p@h/db', JWT_ACCESS_SECRET: 'x'.repeat(32) };

  it('defaults to demo mode', () => {
    expect(validateEnv(base).SMS_MODE).toBe('demo');
  });

  it('refuses termii mode without its key and base URL', () => {
    expect(() => validateEnv({ ...base, SMS_MODE: 'termii' })).toThrow(/TERMII_API_KEY[\s\S]*TERMII_BASE_URL|TERMII_BASE_URL[\s\S]*TERMII_API_KEY/);
    expect(validateEnv({ ...base, SMS_MODE: 'termii', TERMII_API_KEY: 'k', TERMII_BASE_URL: 'https://v3.api.termii.com' }).SMS_MODE).toBe('termii');
  });
});
