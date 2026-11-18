import { z } from 'zod';

const origin = z.url().refine((value) => {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return ['http:', 'https:'].includes(url.protocol) && url.origin === value;
}, 'Expected an HTTP(S) origin without a path');
const databaseUrl = z.string().refine(
  (value) => value.startsWith('file:') && value.length > 5 && !value.includes(':memory:') && !value.includes('\\0'),
  'Expected a persistent SQLite file URL (file:./data/exam-prep.sqlite)',
);
const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_ENV: z.enum(['local', 'test', 'staging', 'production']),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    WORKER_PORT: z.coerce.number().int().min(1).max(65535).default(3002),
    PUBLIC_WEB_ORIGIN: origin,
    CORS_ORIGINS: z
      .string()
      .transform((s) => s.split(',').map((v) => v.trim()))
      .pipe(z.array(origin).min(1)),
    DATABASE_URL: databaseUrl,
    FIREBASE_PROJECT_ID: z.string().min(1).optional(),
    FIREBASE_AUTH_EMULATOR_HOST: z
      .string()
      .regex(/^[\w.-]+:\d+$/)
      .optional(),
  })
  .superRefine((env, ctx) => {
    const deployed =
      env.NODE_ENV === 'production' || ['staging', 'production'].includes(env.APP_ENV);
    if (deployed && env.FIREBASE_AUTH_EMULATOR_HOST) {
      ctx.addIssue({
        code: 'custom',
        path: ['FIREBASE_AUTH_EMULATOR_HOST'],
        message: 'Emulator is forbidden outside local/test development',
      });
    }
    if (
      ['staging', 'production'].includes(env.APP_ENV) &&
      (env.FIREBASE_PROJECT_ID?.startsWith('demo-') ||
        env.CORS_ORIGINS.some((s) => !s.startsWith('https://')))
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['APP_ENV'],
        message: 'Deployed environments require a real project and HTTPS origins',
      });
    }
    if (env.API_PORT === env.WORKER_PORT)
      ctx.addIssue({
        code: 'custom',
        path: ['WORKER_PORT'],
        message: 'API and worker ports must differ',
      });
  });

export type Environment = z.infer<typeof schema>;
export function parseEnvironment(input: Record<string, unknown>): Environment {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new Error(
      `Invalid environment: ${result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
  }
  return result.data;
}
