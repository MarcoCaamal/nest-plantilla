import { z } from 'zod';

/** Base settings only; derived projects can use baseEnvSchema.extend({ ... }). */
export const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string()
    .regex(/^\d+$/, 'PORT must be a decimal integer')
    .default('3000')
    .transform((value) => Number(value))
    .pipe(z.number().int().min(1).max(65535)),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),
  SERVICE_NAME: z.string()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'Invalid service identifier')
    .default('nest-plantilla'),
});

export type BaseEnv = z.output<typeof baseEnvSchema>;

/**
 * Opinionated preset settings. Keep baseEnvSchema unchanged so main's
 * extension contract and the existing base template tests stay compatible.
 */
const csvOrigins = z.string().default('http://localhost:4200')
  .transform((value) => value.split(',').map((item) => item.trim()).filter(Boolean))
  .pipe(z.array(z.url().refine((url) => ['http:', 'https:'].includes(new URL(url).protocol)))
    .min(1));

const nonEmptyOptional = z.string().trim().min(1).optional().or(z.literal('').transform(() => undefined));

export const presetEnvSchema = baseEnvSchema.extend({
  DATABASE_URL: z.url().refine((value) => value.startsWith('postgresql://') || value.startsWith('postgres://')),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  RESEND_API_KEY: nonEmptyOptional,
  MAIL_FROM: z.email(),
  MAILPIT_HOST: nonEmptyOptional,
  MAILPIT_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.url().optional().or(z.literal('').transform(() => undefined)),
  OTEL_EXPORTER_OTLP_HEADERS: nonEmptyOptional,
  CORS_ORIGINS: csvOrigins,
}).superRefine((env, context) => {
  if (env.NODE_ENV === 'production' && !env.RESEND_API_KEY) {
    context.addIssue({ code: 'custom', path: ['RESEND_API_KEY'], message: 'Required in production' });
  }
});

export type PresetEnv = z.output<typeof presetEnvSchema>;
