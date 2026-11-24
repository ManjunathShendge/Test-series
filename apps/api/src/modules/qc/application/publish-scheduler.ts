import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { transaction, type Database } from '@exam-prep/db';
import { DATABASE } from '../../../database/database.module.js';

const EVERY_MS = 60_000;

/**
 * Publishes approved tests whose scheduled time has passed (PRD 4.3 "schedule publish").
 * Runs without a user context; the database function is idempotent, so several API instances
 * running it at once publish each test exactly once.
 */
@Injectable()
export class PublishScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(PublishScheduler.name);
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
      const published = await transaction(this.db, async (client) => {
        const { rows } = await client.query<{ count: number }>('SELECT public.publish_due_tests() AS count');
        return rows[0]?.count ?? 0;
      });
      if (published) this.logger.log(`Published ${published} scheduled test(s)`);
    } catch {
      this.logger.warn('Scheduled publishing check failed; it will run again in a minute');
    } finally {
      this.running = false;
    }
  }
}
