import { ServiceUnavailableException } from '@nestjs/common';
import type { Database } from '../db/database.module.js';
import { HealthController } from './health.controller.js';

// A fake db with only the method the controller uses — no real connection needed.
const controllerWith = (execute: () => Promise<unknown>) =>
  new HealthController({ execute } as unknown as Database);

describe('HealthController', () => {
  it('reports ok when the database responds', async () => {
    const result = await controllerWith(() => Promise.resolve()).check();
    expect(result).toMatchObject({ status: 'ok', db: 'up' });
  });

  it('throws 503 when the database is unreachable', async () => {
    const controller = controllerWith(() => Promise.reject(new Error('connection refused')));
    await expect(controller.check()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
