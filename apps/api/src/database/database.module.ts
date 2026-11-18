import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import { checkDatabase, createDatabase, type Database } from '@exam-prep/db';
import { parseEnvironment } from '../config/env.js';

export const ENVIRONMENT = Symbol('ENVIRONMENT');
export const DATABASE = Symbol('DATABASE');

@Injectable()
export class DatabaseLifecycle implements OnApplicationShutdown {
  constructor(@Inject(DATABASE) private readonly database: Database) {}
  async onApplicationShutdown(): Promise<void> {
    await this.database.end();
  }
}

@Global()
@Module({
  providers: [
    { provide: ENVIRONMENT, useFactory: () => parseEnvironment(process.env) },
    {
      provide: DATABASE,
      inject: [ENVIRONMENT],
      useFactory: (env: ReturnType<typeof parseEnvironment>) =>
        createDatabase(env.DATABASE_URL, { caCertPath: env.DATABASE_CA_CERT_PATH }),
    },
    DatabaseLifecycle,
  ],
  exports: [ENVIRONMENT, DATABASE],
})
export class DatabaseModule {}

export { checkDatabase };
