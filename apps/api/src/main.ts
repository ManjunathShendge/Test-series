import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

import { parseEnvironment } from './config/env.js';

async function bootstrap(): Promise<void> {
  const env = parseEnvironment(process.env);
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  app.enableCors({ origin: env.CORS_ORIGINS, credentials: true });
  app.setGlobalPrefix('v1', { exclude: ['health/live', 'health/ready'] });

  const port = env.API_PORT;
  await app.listen(port);
  console.log(`API listening on http://localhost:${port}`);
}

await bootstrap();
