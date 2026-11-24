import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { transaction, type Database } from '@exam-prep/db';
import { DATABASE } from '../../../database/database.module.js';

const EVERY_MS = 30_000;

/**
 * Deadline finalizer (TEST_ENGINE "Deadline and submit race"): times out and scores attempts
 * whose deadline passed more than 30 seconds ago, so a closed tab still gets a result. The
 * database function locks each attempt, so it races safely with a manual submit.
 */
@Injectable()
export class AttemptFinalizer implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(AttemptFinalizer.name);
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(@Inject(DATABASE) private readonly db: Database) {}

  onApplicationBootstrap(): void {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), EVERY_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const closed = await transaction(this.db, async (client) => {
        const { rows } = await client.query<{ count: number }>('SELECT public.finalize_expired_attempts() AS count');
        return rows[0]?.count ?? 0;
      });
      if (closed) this.logger.log(`Timed out ${closed} attempt(s) past their deadline`);
    } catch {
      this.logger.warn('Attempt finalizer failed; it will run again shortly');
    } finally {
      this.running = false;
    }
  }
}
