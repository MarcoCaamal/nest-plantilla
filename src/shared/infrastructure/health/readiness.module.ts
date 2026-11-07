import {
  Module, type DynamicModule, type ModuleMetadata, type Type,
} from '@nestjs/common';
import { ReadinessCheckPort } from './readiness-check.port';
import { ReadinessController } from './readiness.controller';
import { ReadinessService } from './readiness.service';

export interface ReadinessOptions {
  /** Real critical dependency checks; an empty array is never considered ready. */
  readonly checks: readonly Type<ReadinessCheckPort>[];
  readonly imports?: ModuleMetadata['imports'];
  /** Maximum duration per check. Defaults to 2000ms. */
  readonly timeoutMs?: number;
}

/**
 * Opt-in readiness endpoint. Not imported by the starter's AppModule because
 * a dependency-free template has no downstream readiness checks to execute.
 */
@Module({})
export class ReadinessModule {
  static register(options: ReadinessOptions): DynamicModule {
    if (options.checks.length === 0) {
      throw new Error('Register at least one real readiness check');
    }
    const timeout = options.timeoutMs ?? 2000;
    if (!Number.isInteger(timeout) || timeout < 1 || timeout > 30_000) {
      throw new Error('Readiness timeout must be between 1 and 30000 ms');
    }

    return {
      module: ReadinessModule,
      imports: options.imports ?? [],
      controllers: [ReadinessController],
      providers: [
        ...options.checks,
        {
          provide: ReadinessService,
          useFactory: (...checks: ReadinessCheckPort[]) => new ReadinessService(checks, timeout),
          inject: [...options.checks],
        },
      ],
      exports: [ReadinessService],
    };
  }
}
