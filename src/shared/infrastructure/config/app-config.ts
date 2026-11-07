import { Global, Module, type DynamicModule } from '@nestjs/common';
import { z } from 'zod';
import { baseEnvSchema, type BaseEnv } from './env.schema';

/** Exposes keys and error codes, never raw environment values. */
export class EnvironmentValidationError extends Error {
  constructor(readonly fields: readonly string[]) {
    super('Invalid environment configuration: ' + fields.join(', '));
    this.name = 'EnvironmentValidationError';
  }
}

export function parseEnv(input?: NodeJS.ProcessEnv): BaseEnv;
export function parseEnv<TSchema extends z.ZodType>(
  input: NodeJS.ProcessEnv,
  schema: TSchema,
): z.output<TSchema>;
export function parseEnv(
  input: NodeJS.ProcessEnv = process.env,
  schema: z.ZodType = baseEnvSchema,
): unknown {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw new EnvironmentValidationError(result.error.issues.map((issue) =>
    (issue.path.join('.') || '(root)') + ': ' + issue.code,
  ));
}

/** Readonly configuration; no dependency on process.env after bootstrap. */
export class AppConfig<TEnv extends BaseEnv = BaseEnv> {
  readonly values: Readonly<TEnv>;

  constructor(env: TEnv) {
    this.values = Object.freeze({ ...env });
  }

  get<TKey extends keyof TEnv>(key: TKey): TEnv[TKey] {
    return this.values[key];
  }
}

/**
 * Register only from a validated bootstrap, never from module-import side
 * effects. This allows invalid env to fail before NestFactory creates an app.
 */
@Global()
@Module({})
export class ConfigModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: ConfigModule,
      providers: [{ provide: AppConfig, useValue: config }],
      exports: [AppConfig],
    };
  }
}
