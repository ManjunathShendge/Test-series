import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { buildRules, FixedWindowLimiter, rateLimit, securityHeaders } from './common/security/http-protection.js';

import { parseEnvironment } from './config/env.js';

async function bootstrap(): Promise<void> {
  const env = parseEnvironment(process.env);
  // rawBody: provider webhook signatures are computed over the original bytes.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.enableShutdownHooks();
  app.enableCors({ origin: env.CORS_ORIGINS, credentials: true });
  // Behind a load balancer, the client address comes from X-Forwarded-For (TRUST_PROXY_HOPS).
  const http = app.getHttpAdapter().getInstance() as { set(name: string, value: unknown): void; disable(name: string): void };
  http.disable('x-powered-by');
  if (env.TRUST_PROXY_HOPS > 0) http.set('trust proxy', env.TRUST_PROXY_HOPS);
  app.use(securityHeaders(['staging', 'production'].includes(env.APP_ENV)));
  app.use(rateLimit(new FixedWindowLimiter(buildRules(env.INTERNAL_CALLER_TOKEN))));
  app.setGlobalPrefix('v1', { exclude: ['health/live', 'health/ready'] });

  const port = env.API_PORT;
  await app.listen(port);
  console.log(`API listening on http://localhost:${port}`);
}

await bootstrap();
