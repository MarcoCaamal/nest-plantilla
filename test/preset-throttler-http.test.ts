import 'reflect-metadata';
import { Controller, Module, Post, UseGuards, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Throttle, ThrottlerModule, seconds } from '@nestjs/throttler';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthThrottlerGuard } from '@/shared/infrastructure/security/auth-throttler.guard';
import { GlobalExceptionFilter } from '@/shared/infrastructure/http/filters/global-exception.filter';

class TestAuthController {
  login() { return { allowed: true }; }
  refresh() { return { allowed: true }; }
  forgotPassword() { return { allowed: true }; }
  shortWindow() { return { allowed: true }; }
  unprotected() { return { allowed: true }; }
}

// Apply production-style Nest method decorators without requiring the Vitest
// transformation of experimental decorator syntax in the test source.
Controller('throttle-test')(TestAuthController);
for (const [method, path, limit, ttl] of [
  ['login', 'login', 5, 60_000],
  ['refresh', 'refresh', 15, 60_000],
  ['forgotPassword', 'forgot-password', 3, 60_000],
  ['shortWindow', 'short-window', 1, 120],
] as const) {
  const descriptor = Object.getOwnPropertyDescriptor(TestAuthController.prototype, method)!;
  Post(path)(TestAuthController.prototype, method, descriptor);
  Throttle({ default: { limit, ttl } })(TestAuthController.prototype, method, descriptor);
  UseGuards(AuthThrottlerGuard)(TestAuthController.prototype, method, descriptor);
}
Post('unprotected')(
  TestAuthController.prototype,
  'unprotected',
  Object.getOwnPropertyDescriptor(TestAuthController.prototype, 'unprotected')!,
);

class TestThrottlerApp {}
Module({
  imports: [ThrottlerModule.forRoot([{ ttl: seconds(60), limit: 5, blockDuration: 0 }])],
  controllers: [TestAuthController],
  providers: [AuthThrottlerGuard],
})(TestThrottlerApp);

describe('@nestjs/throttler with RFC 9457 adapter', () => {
  let app: INestApplication;
  let base: string;

  async function post(path: string) {
    const response = await fetch(base + path, { method: 'POST' });
    const body: unknown = await response.json();
    return { status: response.status, headers: response.headers, body };
  }

  beforeAll(async () => {
    app = await NestFactory.create(TestThrottlerApp, { logger: false });
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as { port: number };
    base = 'http://127.0.0.1:' + address.port;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  async function expectLimit(path: string, allowedRequests: number) {
    for (let i = 0; i < allowedRequests; i++) {
      expect((await post(path)).status).toBe(201);
    }
    const limited = await post(path);
    expect(limited.status).toBe(429);
    expect(limited.headers.get('content-type')).toContain('application/problem+json');
    expect(limited.body).toMatchObject({
      type: 'about:blank',
      title: 'Too Many Requests',
      status: 429,
      code: 'RATE_LIMITED',
    });
    const retryAfter = Number(limited.headers.get('retry-after'));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);
  }

  it('limits login to five requests and does not throttle other endpoints globally', async () => {
    await expectLimit('/throttle-test/login', 5);
    for (let index = 0; index < 7; index++) {
      expect((await post('/throttle-test/unprotected')).status).toBe(201);
    }
  });

  it('limits refresh and forgot-password independently', async () => {
    await expectLimit('/throttle-test/refresh', 15);
    await expectLimit('/throttle-test/forgot-password', 3);
  });

  it('allows requests again when the throttler window expires', async () => {
    expect((await post('/throttle-test/short-window')).status).toBe(201);
    expect((await post('/throttle-test/short-window')).status).toBe(429);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect((await post('/throttle-test/short-window')).status).toBe(201);
  });
});
