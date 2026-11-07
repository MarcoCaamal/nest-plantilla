import 'reflect-metadata';
import http from 'node:http';
import {
  Controller, ForbiddenException, Get, Module, UnauthorizedException, UseGuards,
  type INestApplication,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { GlobalExceptionFilter } from '@/shared/infrastructure/http/filters/global-exception.filter';
import { Result } from '@/shared/core/result';
import type { AuthenticationError } from '@/shared/domain/auth/authentication-error';
import type { UserPrincipal } from '@/shared/domain/auth/principal';
import {
  AuthModule, UserAuthenticationGuard, UserCredentialVerifierPort,
} from '@/modules/auth/public';
import { AuthzModule } from '@/modules/authz/public';
import { Authorize } from '@/shared/infrastructure/http/decorators/authorize.decorator';
import { GateGuard } from '@/shared/infrastructure/http/guards/gate.guard';
import { requestContext } from '@/shared/infrastructure/observability/context/request-context';
import { jsonLogger } from '@/shared/infrastructure/observability/logging/json-logger';
import { ObservabilityModule } from '@/shared/infrastructure/observability/observability.module';

interface CompletedRequest {
  readonly event: string;
  readonly requestId?: string;
  readonly statusCode: number;
  readonly outcome: string;
  readonly route: string;
  readonly method: string;
  readonly durationMs: number;
  readonly actorId?: string;
}

class FixtureController {
  status() {
    return { requestId: requestContext.current()?.requestId };
  }

  async concurrent() {
    await new Promise((resolve) => setTimeout(resolve, 20));
    jsonLogger.log({ event: 'fixture.operation' });
    return { requestId: requestContext.current()?.requestId };
  }

  unauthorized() { throw new UnauthorizedException(); }
  forbidden() { throw new ForbiddenException(); }
  crash() { throw new Error('private technical error'); }
  secured() {
    jsonLogger.log({ event: 'fixture.secured' });
    return { status: 'authorized' };
  }

  async hold() {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return { completed: true };
  }
}

// Vitest's test-transformer does not emit legacy TS decorators on fixture classes.
Controller('observed')(FixtureController);
for (const [method, route] of [
  ['status', 'status'], ['concurrent', 'concurrent/:resourceId'],
  ['unauthorized', 'unauthorized'], ['forbidden', 'forbidden'],
  ['crash', 'crash'], ['hold', 'hold'], ['secured', 'secured'],
] as const) {
  Get(route)(FixtureController.prototype, method, Object.getOwnPropertyDescriptor(FixtureController.prototype, method)!);
}

const securedDescriptor = Object.getOwnPropertyDescriptor(FixtureController.prototype, 'secured')!;
UseGuards(UserAuthenticationGuard, GateGuard)(FixtureController.prototype, 'secured', securedDescriptor);
Authorize('records:read')(FixtureController.prototype, 'secured', securedDescriptor);

class FixtureUserVerifier extends UserCredentialVerifierPort {
  async verify(token: string) {
    if (token !== 'verified' && token !== 'limited') {
      return Result.err<AuthenticationError>({ type: 'CREDENTIALS_INVALID' });
    }
    const principal: UserPrincipal = {
      id: 'user-99',
      type: 'USER',
      roles: ['operator'],
      permissions: token === 'verified' ? ['records:read'] : [],
      attributes: {},
    };
    return Result.ok(principal);
  }
}

class FixtureModule {}
Module({
  imports: [
    ObservabilityModule,
    AuthzModule,
    AuthModule.register({
      verifier: { provide: UserCredentialVerifierPort, useClass: FixtureUserVerifier },
    }),
  ],
  controllers: [FixtureController],
})(FixtureModule);

describe('request logging middleware + real Nest HTTP lifecycle', () => {
  let app: INestApplication;
  let base: string;
  const completed: CompletedRequest[] = [];
  const actorLogs: Array<{ requestId?: string; actorId?: string }> = [];
  const log = vi.spyOn(jsonLogger, 'log');
  const warn = vi.spyOn(jsonLogger, 'warn');

  beforeAll(async () => {
    const collect = (value: unknown) => {
      if (typeof value !== 'object' || value === null || !('event' in value) ||
          value.event !== 'http.request.completed') return;
      completed.push({
        ...(value as CompletedRequest),
        requestId: requestContext.current()?.requestId,
        actorId: requestContext.current()?.actor?.id,
      });
    };
    log.mockImplementation((message) => {
      collect(message);
      if (typeof message === 'object' && message !== null && 'event' in message &&
          message.event === 'fixture.secured') {
        actorLogs.push({
          requestId: requestContext.current()?.requestId,
          actorId: requestContext.current()?.actor?.id,
        });
      }
    });
    warn.mockImplementation((message) => collect(message));
    app = await NestFactory.create(FixtureModule, { logger: false });
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });

  afterAll(async () => {
    await app?.close();
    log.mockRestore();
    warn.mockRestore();
  });

  it('echoes safe supplied request IDs and logs exactly once per completed response', async () => {
    const before = completed.length;
    const response = await fetch(base + '/observed/status', {
      headers: { 'X-Request-ID': 'external-1' },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('X-Request-ID')).toBe('external-1');
    expect(await response.json()).toEqual({ requestId: 'external-1' });
    await vi.waitFor(() => expect(completed.length).toBe(before + 1));
    expect(completed.at(-1)).toMatchObject({
      statusCode: 200,
      requestId: 'external-1',
      route: '/observed/status',
      outcome: 'completed',
      method: 'GET',
    });
  });

  it('generates an ID for unsafe inbound values without reflecting them', async () => {
    const response = await fetch(base + '/observed/status', {
      headers: { 'X-Request-ID': 'invalid,duplicate' },
    });
    const id = response.headers.get('X-Request-ID');
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(id).not.toBe('invalid,duplicate');
    expect(await response.json()).toEqual({ requestId: id });
  });

  it('isolates overlapping requests and does not log raw route parameters', async () => {
    const [a, b] = await Promise.all([
      fetch(base + '/observed/concurrent/customer-123', { headers: { 'X-Request-ID': 'first-req' } }),
      fetch(base + '/observed/concurrent/customer-456', { headers: { 'X-Request-ID': 'second-req' } }),
    ]);
    expect(await a.json()).toEqual({ requestId: 'first-req' });
    expect(await b.json()).toEqual({ requestId: 'second-req' });
    const items = completed.filter((entry) => ['first-req', 'second-req'].includes(entry.requestId ?? ''));
    expect(items).toHaveLength(2);
    expect(items.every((entry) => !entry.route.includes('customer-'))).toBe(true);
  });

  it('logs 401, 403, 500 and unknown routes even when handlers/interceptors fail', async () => {
    const urls = [
      ['unauthorized', 401], ['forbidden', 403], ['crash', 500],
      ['missing', 404],
    ] as const;
    for (const [route, status] of urls) {
      const id = 'status-' + status;
      const response = await fetch(base + '/observed/' + route, {
        headers: { 'X-Request-ID': id },
      });
      expect(response.status).toBe(status);
      expect(response.headers.get('X-Request-ID')).toBe(id);
      const body = await response.text();
      if (status === 500) expect(body).not.toContain('private technical error');
      await vi.waitFor(() => expect(completed.filter((entry) => entry.requestId === id)).toHaveLength(1));
      expect(completed.find((entry) => entry.requestId === id)?.statusCode).toBe(status);
    }
  });

  it('logs AuthN/AuthZ failures and trusted actor context after the Gate', async () => {
    const cases = [
      { id: 'guard-401', token: undefined, status: 401, actor: undefined },
      { id: 'guard-403', token: 'limited', status: 403, actor: 'user-99' },
      { id: 'guard-200', token: 'verified', status: 200, actor: 'user-99' },
    ] as const;
    for (const example of cases) {
      const headers: Record<string, string> = { 'X-Request-ID': example.id };
      if (example.token) headers.Authorization = 'Bearer ' + example.token;
      const response = await fetch(base + '/observed/secured', { headers });
      expect(response.status).toBe(example.status);
      await vi.waitFor(() => expect(completed.filter((entry) => entry.requestId === example.id)).toHaveLength(1));
      const recorded = completed.find((entry) => entry.requestId === example.id);
      expect(recorded?.statusCode).toBe(example.status);
      expect(recorded?.actorId).toBe(example.actor);
    }
    expect(actorLogs).toContainEqual({
      requestId: 'guard-200',
      actorId: 'user-99',
    });
  });

  it('emits exactly one aborted log on client disconnect', async () => {
    const id = 'aborted-req';
    await new Promise<void>((resolve, reject) => {
      const request = http.get(base + '/observed/hold', {
        headers: { 'X-Request-ID': id },
      });
      request.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code !== 'ECONNRESET') reject(error);
        else resolve();
      });
      setTimeout(() => request.destroy(), 25);
    });
    await vi.waitFor(() => {
      expect(completed.filter((entry) => entry.requestId === id)).toHaveLength(1);
    }, { timeout: 1500 });
    expect(completed.find((entry) => entry.requestId === id)).toMatchObject({
      outcome: 'aborted',
      statusCode: 499,
    });
  });
});
