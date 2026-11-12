import 'reflect-metadata';

/**
 * Worker entry point. Runs in its own process against the same database and
 * module graph as the HTTP app, so a slow job can never block a request.
 *
 * pg-boss registration and the outbox dispatcher arrive in M1, once the schema
 * exists. Keeping the process separate from the start is deliberate: it is the
 * boundary docs/ARCHITECTURE.md requires, not an optimisation added later.
 */
async function bootstrapWorker(): Promise<void> {
  console.log('Worker starting');
  // pg-boss start and job registration land in M1.
  console.log('Worker ready, no consumers registered yet');
}

await bootstrapWorker();
