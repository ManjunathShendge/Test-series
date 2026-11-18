import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import { checkDatabase, createDatabase } from '@exam-prep/db';
import { parseEnvironment } from '../config/env.js';

export const ENVIRONMENT = Symbol('ENVIRONMENT');
export const DATABASE = Symbol('DATABASE');
type Database = ReturnType<typeof createDatabase>;

@Injectable()
export class DatabaseLifecycle implements OnApplicationShutdown {
  constructor(@Inject(DATABASE) private readonly database: Database) {}
  async onApplicationShutdown(): Promise<void> {
    this.database.close();
  }
}

@Global()
@Module({
  providers: [
    { provide: ENVIRONMENT, useFactory: () => parseEnvironment(process.env) },
    {
      provide: DATABASE,
      inject: [ENVIRONMENT],
      useFactory: (env: ReturnType<typeof parseEnvironment>) => createDatabase(env.DATABASE_URL),
    },
    DatabaseLifecycle,
  ],
  exports: [ENVIRONMENT, DATABASE],
})
export class DatabaseModule {}

export { checkDatabase };
