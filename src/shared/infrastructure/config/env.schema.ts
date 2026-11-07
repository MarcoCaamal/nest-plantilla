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
