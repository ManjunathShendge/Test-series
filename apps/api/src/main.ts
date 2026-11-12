import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

const DEFAULT_PORT = 3001;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('v1', { exclude: ['health/live', 'health/ready'] });

  const port = Number(process.env['API_PORT'] ?? DEFAULT_PORT);
  await app.listen(port);
  console.log(`API listening on http://localhost:${port}`);
}

await bootstrap();
