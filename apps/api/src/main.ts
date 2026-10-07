import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import type { Env } from './config/env.js';
import { CorsIoAdapter } from './realtime/cors-io.adapter.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.use(cookieParser()); // req.cookies, for the httpOnly refresh-token cookie
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  // Behind proxies (Vercel's rewrite, Render's load balancer), the client's IP is in
  // X-Forwarded-For. Trust exactly that many hops: trusting more would let callers fake their IP.
  app.set('trust proxy', config.get('TRUST_PROXY_HOPS', { infer: true }));
  app.useWebSocketAdapter(new CorsIoAdapter(app, config.get('WEB_ORIGINS', { infer: true })));
  if (config.get('NODE_ENV', { infer: true }) === 'production' && config.get('SMS_MODE', { infer: true }) === 'demo') {
    // Allowed on purpose (a free demo deployment), but never silently.
    new Logger('Security').warn(
      'SMS_MODE=demo in production: login codes are shown in the app, so anyone can log in as any number. ' +
        'Fine for a demo with test data; set SMS_MODE=termii before real people use it.',
    );
  }
  await app.listen(config.get('PORT', { infer: true }));
}
await bootstrap();
