import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DB, type Database } from '../db/database.module.js';
import { Public } from '../auth/decorators.js';

@Public()
@Controller('health')
export class HealthController {
  constructor(@Inject(DB) private readonly db: Database) {}

  @Get()
  async check() {
    const start = Date.now();
    try {
      await this.db.execute(sql`select 1`);
    } catch {
      // 503 (not 200 with an error body) so load balancers and uptime checks see the failure.
      throw new ServiceUnavailableException({ status: 'error', db: 'down' });
    }
    return { status: 'ok', db: 'up', dbLatencyMs: Date.now() - start };
  }
}
