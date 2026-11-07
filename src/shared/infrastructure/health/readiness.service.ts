import type { BeforeApplicationShutdown } from '@nestjs/common';
import { ReadinessCheckPort } from './readiness-check.port';

export type ReadinessCheckStatus = 'ready' | 'unavailable' | 'timeout';

export interface ReadinessCheckResult {
  readonly name: string;
  readonly status: ReadinessCheckStatus;
}

export interface ReadinessReport {
  readonly status: 'ready' | 'not_ready';
  readonly checks: readonly ReadinessCheckResult[];
}

const CHECK_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9._-]{0,63}$/;

/**
 * Executes dependency checks concurrently with independent deadlines.
 * Does not reveal adapter errors or infrastructure addresses to HTTP clients.
 */
export class ReadinessService implements BeforeApplicationShutdown {
  private shuttingDown = false;
  constructor(
    private readonly checks: readonly ReadinessCheckPort[],
    private readonly timeoutMs: number,
  ) {
    if (checks.length === 0) throw new Error('Readiness requires at least one real dependency check');
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) {
      throw new Error('Readiness timeout must be an integer between 1 and 30000 ms');
    }
    const names = new Set<string>();
    for (const check of checks) {
      if (!CHECK_NAME_PATTERN.test(check.name) || names.has(check.name)) {
        throw new Error('Readiness checks must have unique, safe names');
      }
      names.add(check.name);
    }
  }

  beforeApplicationShutdown(): void {
    // Draining starts before Nest disposes of its HTTP transport.
    this.shuttingDown = true;
  }

  async evaluate(): Promise<ReadinessReport> {
    if (this.shuttingDown) {
      return {
        status: 'not_ready',
        checks: this.checks.map((check) => ({
          name: check.name,
          status: 'unavailable' as const,
        })),
      };
    }

    const statuses = await Promise.all(this.checks.map(async (check): Promise<ReadinessCheckResult> => {
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;

      const attempt: Promise<ReadinessCheckStatus> = Promise.resolve()
        .then(() => check.check(controller.signal))
        .then((ready) => ready === true ? 'ready' : 'unavailable')
        .catch(() => 'unavailable');

      const deadline = new Promise<ReadinessCheckStatus>((resolve) => {
        timer = setTimeout(() => {
          resolve('timeout');
          controller.abort();
        }, this.timeoutMs);
      });

      try {
        const status = await Promise.race([attempt, deadline]);
        return { name: check.name, status };
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    }));

    return {
      status: statuses.every((item) => item.status === 'ready') ? 'ready' : 'not_ready',
      checks: statuses,
    };
  }
}
