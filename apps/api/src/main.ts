import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import type { Env } from './config/env.js';
import { CorsIoAdapter } from './realtime/cors-io.adapter.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser()); // req.cookies, for the httpOnly refresh-token cookie
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  app.useWebSocketAdapter(new CorsIoAdapter(app, config.get('WEB_ORIGINS', { infer: true })));
  await app.listen(config.get('PORT', { infer: true }));
}
await bootstrap();
