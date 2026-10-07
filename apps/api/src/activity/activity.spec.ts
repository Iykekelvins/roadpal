import type { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import type { Database } from '../db/database.module.js';
import type { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { SweeperService } from '../sweeps/sweeper.service.js';
import { ActivityService, IDLE_AFTER_MS } from './activity.service.js';

describe('ActivityService', () => {
  it('is idle before any traffic, active right after, and idle again once the window passes', () => {
    const activity = new ActivityService();
    expect(activity.isActive(1_000_000)).toBe(false);
    activity.touch(1_000_000);
    expect(activity.isActive(1_000_000 + IDLE_AFTER_MS - 1)).toBe(true);
    expect(activity.isActive(1_000_000 + IDLE_AFTER_MS)).toBe(false);
  });

  it('covers the longest deadline traffic can start (a widened request, ~14.5 min)', () => {
    expect(IDLE_AFTER_MS).toBeGreaterThan(14.5 * 60_000);
  });
});

describe('SweeperService when idle', () => {
  const config = { get: () => true } as unknown as ConfigService<Env, true>;
  const make = (activity: ActivityService) => {
    const sweeper = new SweeperService({} as Database, {} as RealtimeGateway, config, activity);
    const runOnce = vi.spyOn(sweeper, 'runOnce').mockResolvedValue(undefined);
    return { sweeper, runOnce };
  };

  it('does not touch the database while nobody is using the app', async () => {
    const { sweeper, runOnce } = make(new ActivityService());
    await sweeper.tick();
    await sweeper.cleanup();
    expect(runOnce).not.toHaveBeenCalled();
  });

  it('sweeps as soon as there is traffic again', async () => {
    const activity = new ActivityService();
    const { sweeper, runOnce } = make(activity);
    await sweeper.tick();
    activity.touch();
    await sweeper.tick();
    expect(runOnce).toHaveBeenCalledTimes(1);
  });
});
