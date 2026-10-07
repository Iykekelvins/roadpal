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
  await app.listen(config.get('PORT', { infer: true }));
}
await bootstrap();
