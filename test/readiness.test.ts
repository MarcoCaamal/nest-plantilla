import { describe, expect, it } from 'vitest';
import { ReadinessCheckPort } from '@/shared/infrastructure/health/readiness-check.port';
import { ReadinessModule } from '@/shared/infrastructure/health/readiness.module';
import { ReadinessService } from '@/shared/infrastructure/health/readiness.service';

class DatabaseCheck extends ReadinessCheckPort {
  readonly name = 'database';
  async check(): Promise<boolean> { return true; }
}

class CacheCheck extends ReadinessCheckPort {
  readonly name = 'cache';
  async check(): Promise<boolean> {
    await new Promise((resolve) => setTimeout(resolve, 5));
    return false;
  }
}

class BrokenCheck extends ReadinessCheckPort {
  readonly name = 'worker';
  async check(): Promise<boolean> {
    throw new Error('password=sensitive internal connection string');
  }
}

class StuckCheck extends ReadinessCheckPort {
  readonly name = 'external-api';
  aborted = false;
  async check(signal: AbortSignal): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      signal.addEventListener('abort', () => {
        this.aborted = true;
        resolve(false);
      }, { once: true });
    });
  }
}

describe('readiness with real dependency checks', () => {
  it('reports ready only when all checks return true', async () => {
    const service = new ReadinessService([new DatabaseCheck()], 50);
    expect(await service.evaluate()).toEqual({
      status: 'ready',
      checks: [{ name: 'database', status: 'ready' }],
    });
  });

  it('runs checks in parallel and marks false/throw independently without leaking messages', async () => {
    const service = new ReadinessService(
      [new DatabaseCheck(), new CacheCheck(), new BrokenCheck()],
      100,
    );
    const report = await service.evaluate();
    expect(report).toEqual({
      status: 'not_ready',
      checks: [
        { name: 'database', status: 'ready' },
        { name: 'cache', status: 'unavailable' },
        { name: 'worker', status: 'unavailable' },
      ],
    });
    expect(JSON.stringify(report)).not.toContain('password');
  });

  it('enforces deadlines and signals cooperative cancellation', async () => {
    const stuck = new StuckCheck();
    const service = new ReadinessService([new DatabaseCheck(), stuck], 15);
    const begin = performance.now();
    const report = await service.evaluate();
    const duration = performance.now() - begin;
    expect(duration).toBeLessThan(200);
    expect(stuck.aborted).toBe(true);
    expect(report).toEqual({
      status: 'not_ready',
      checks: [
        { name: 'database', status: 'ready' },
        { name: 'external-api', status: 'timeout' },
      ],
    });
  });

  it('becomes not-ready when graceful shutdown begins and stops probing dependencies', async () => {
    let probes = 0;
    const check: ReadinessCheckPort = {
      name: 'database',
      check: async () => { probes += 1; return true; },
    };
    const service = new ReadinessService([check], 100);
    expect((await service.evaluate()).status).toBe('ready');
    expect(probes).toBe(1);

    service.beforeApplicationShutdown();
    const report = await service.evaluate();
    expect(report).toEqual({
      status: 'not_ready',
      checks: [{ name: 'database', status: 'unavailable' }],
    });
    expect(probes).toBe(1);
  });

  it('fails closed on empty checks, duplicate names, malformed names and invalid timeout', () => {
    expect(() => new ReadinessService([], 100)).toThrow('at least one');
    expect(() => new ReadinessService([new DatabaseCheck(), new DatabaseCheck()], 100))
      .toThrow('unique');
    expect(() => new ReadinessService([
      { name: 'database token=secret', check: async () => true },
    ], 100)).toThrow('safe names');
    for (const timeoutMs of [0, -5, 30_001, Number.NaN, 3.1]) {
      expect(() => new ReadinessService([new DatabaseCheck()], timeoutMs)).toThrow();
      expect(() => ReadinessModule.register({ checks: [DatabaseCheck], timeoutMs })).toThrow();
    }
    expect(() => ReadinessModule.register({ checks: [] })).toThrow('at least one');
  });
});
