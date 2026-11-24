import { randomUUID } from 'node:crypto';
import type { Database } from '@exam-prep/db';

export interface Job {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  attempts: number;
}

export type JobHandler = (job: Job) => Promise<void>;

/** A failure that retrying cannot fix (bad payload, missing row): the job fails at once. */
export class PermanentJobError extends Error {}

const LEASE_SECONDS = 120;
const MAX_ATTEMPTS = 6;
/** 1 min, 4 min, 16 min, 1 h, 4 h between attempts. */
const backoffSeconds = (attempts: number) => Math.min(60 * 4 ** (attempts - 1), 4 * 3600);

/**
 * PostgreSQL job queue consumer (CLAUDE.md invariant 6). Jobs are claimed with SKIP LOCKED under a
 * lease, so a crashed worker's jobs are picked up again once the lease expires. Handlers must be
 * idempotent: a job can run more than once. Failed jobs stay in the table for ops to inspect.
 */
export class JobRunner {
  private stopped = false;
  private idle: Promise<void> = Promise.resolve();

  constructor(
    private readonly db: Database,
    private readonly handlers: Record<string, JobHandler>,
    private readonly log: (message: string) => void = console.log,
  ) {}

  /** Claims up to `limit` due jobs of the known kinds. */
  async claim(limit = 10): Promise<Job[]> {
    const lease = randomUUID();
    const { rows } = await this.db.query<Job>(
      `UPDATE jobs SET status = 'running', lease_token = $1, lease_until = NOW() + make_interval(secs => $2), attempts = attempts + 1
        WHERE id IN (
          SELECT id FROM jobs
           WHERE kind = ANY($3::text[]) AND available_at <= NOW()
             AND (status = 'pending' OR (status = 'running' AND lease_until < NOW()))
           ORDER BY available_at LIMIT $4 FOR UPDATE SKIP LOCKED)
        RETURNING id, kind, payload, attempts`,
      [lease, LEASE_SECONDS, Object.keys(this.handlers), limit],
    );
    return rows;
  }

  async runOne(job: Job): Promise<void> {
    try {
      await this.handlers[job.kind]!(job);
      await this.db.query(`UPDATE jobs SET status = 'done', lease_token = NULL, lease_until = NULL WHERE id = $1`, [job.id]);
    } catch (error) {
      const permanent = error instanceof PermanentJobError || job.attempts >= MAX_ATTEMPTS;
      const reason = error instanceof Error ? error.message : String(error);
      // Never log payload contents beyond ids; messages come from our own code and providers.
      this.log(`job ${job.kind} ${job.id} attempt ${job.attempts} ${permanent ? 'failed' : 'will retry'}: ${reason.slice(0, 300)}`);
      await this.db.query(
        permanent
          ? `UPDATE jobs SET status = 'failed', lease_token = NULL, lease_until = NULL WHERE id = $1`
          : `UPDATE jobs SET status = 'pending', lease_token = NULL, lease_until = NULL, available_at = NOW() + make_interval(secs => $2) WHERE id = $1`,
        permanent ? [job.id] : [job.id, backoffSeconds(job.attempts)],
      );
    }
  }

  /** Processes due jobs until none are left; returns how many ran. */
  async drain(): Promise<number> {
    let total = 0;
    for (;;) {
      const jobs = await this.claim();
      if (jobs.length === 0 || this.stopped) return total;
      for (const job of jobs) await this.runOne(job);
      total += jobs.length;
    }
  }

  /** Polls every `intervalMs` until stopped. */
  start(intervalMs = 5000): void {
    const loop = async () => {
      while (!this.stopped) {
        try {
          await this.drain();
        } catch (error) {
          this.log(`job loop error: ${error instanceof Error ? error.message : String(error)}`);
        }
        await new Promise((r) => setTimeout(r, intervalMs));
      }
    };
    this.idle = loop();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    await this.idle;
  }
}

/** Enqueues a job (deduplicated on kind + key) from code running as the worker. */
export async function enqueue(db: Database, kind: string, key: string, payload: Record<string, unknown>, at = new Date()): Promise<void> {
  await db.query(
    `INSERT INTO jobs (id, deduplication_key, kind, payload, available_at) VALUES ($1, $2 || ':' || $3, $2, $4::jsonb, $5)
     ON CONFLICT (deduplication_key) DO NOTHING`,
    [randomUUID(), kind, key, JSON.stringify(payload), at],
  );
}
