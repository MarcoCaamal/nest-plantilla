import 'reflect-metadata';
import {
  Module, type INestApplication,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '@/app.module';
import { HealthController } from '@/shared/infrastructure/http/health.controller';
import { HttpResultInterceptor } from '@/shared/infrastructure/http/interceptors/http-result.interceptor';
import { ReadinessCheckPort } from '@/shared/infrastructure/health/readiness-check.port';
import { ReadinessModule } from '@/shared/infrastructure/health/readiness.module';

class ToggleDatabaseCheck extends ReadinessCheckPort {
  readonly name = 'database';
  static state: 'healthy' | 'unavailable' | 'exception' | 'timeout' = 'healthy';

  async check(signal: AbortSignal): Promise<boolean> {
    switch (ToggleDatabaseCheck.state) {
      case 'healthy': return true;
      case 'unavailable': return false;
      case 'exception': throw new Error('private database endpoint and password');
      case 'timeout': return new Promise<boolean>((resolve) => {
        signal.addEventListener('abort', () => resolve(false), { once: true });
      });
    }
  }
}

class HealthWithReadiness {}
Module({
  imports: [ReadinessModule.register({
    checks: [ToggleDatabaseCheck],
    timeoutMs: 25,
  })],
  controllers: [HealthController],
})(HealthWithReadiness);

describe('opt-in readiness HTTP endpoint', () => {
  let app: INestApplication;
  let base: string;

  beforeAll(async () => {
    app = await NestFactory.create(HealthWithReadiness, { logger: false });
    app.useGlobalInterceptors(new HttpResultInterceptor());
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });

  afterAll(async () => { await app?.close(); });

  it('serves 200 readiness and keeps /health liveness healthy', async () => {
    ToggleDatabaseCheck.state = 'healthy';
    const [ready, live] = await Promise.all([
      fetch(base + '/health/ready'),
      fetch(base + '/health'),
    ]);
    expect(ready.status).toBe(200);
    expect(await ready.json()).toEqual({ status: 'ready' });
    expect(live.status).toBe(200);
    expect(await live.json()).toEqual({ status: 'ok' });
  });

  it('returns 503 RFC 9457 without exposing failing check metadata', async () => {
    ToggleDatabaseCheck.state = 'unavailable';
    const ready = await fetch(base + '/health/ready');
    expect(ready.status).toBe(503);
    expect(ready.headers.get('content-type')).toContain('application/problem+json');
    expect(await ready.json()).toEqual({
      type: 'about:blank',
      title: 'Service Unavailable',
      status: 503,
      code: 'NOT_READY',
      detail: 'One or more critical dependencies are not ready',
    });
    const live = await fetch(base + '/health');
    expect(live.status).toBe(200);
  });

  it('maps thrown infrastructure errors to 503 and does not leak secrets', async () => {
    ToggleDatabaseCheck.state = 'exception';
    const ready = await fetch(base + '/health/ready');
    expect(ready.status).toBe(503);
    expect(await ready.text()).not.toContain('private database endpoint');
  });

  it('handles hanging checks within the bounded timeout and returns 503', async () => {
    ToggleDatabaseCheck.state = 'timeout';
    const start = performance.now();
    const ready = await fetch(base + '/health/ready');
    const duration = performance.now() - start;
    expect(ready.status).toBe(503);
    expect(duration).toBeLessThan(300);
    expect((await ready.json()) as { code: string }).toMatchObject({ code: 'NOT_READY' });
  });

  it('does not expose /health/ready in a project without checks', async () => {
    const template = await NestFactory.create(AppModule, { logger: false });
    try {
      await template.listen(0, '127.0.0.1');
      const response = await fetch((await template.getUrl()) + '/health/ready');
      expect(response.status).toBe(404);
      const live = await fetch((await template.getUrl()) + '/health');
      expect(live.status).toBe(200);
    } finally {
      await template.close();
    }
  });
});
