import { Logger, type ArgumentsHost } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { GlobalExceptionFilter } from '@/shared/infrastructure/http/filters/global-exception.filter';
import { requestContext } from '@/shared/infrastructure/observability/context/request-context';
import { JsonLogger } from '@/shared/infrastructure/observability/logging/json-logger';
import { resolveRequestId } from '@/shared/infrastructure/observability/http/request-logging.middleware';

describe('X-Request-ID validation', () => {
  it('accepts a bounded ID and generates safe UUIDs for untrusted headers', () => {
    expect(resolveRequestId('req_ABC-123')).toBe('req_ABC-123');
    for (const invalid of ['', ' hi ', 'bad,duplicate', 'x'.repeat(65), ['one', 'two'], 'abc/def']) {
      expect(resolveRequestId(invalid)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    }
    expect(resolveRequestId(undefined)).toMatch(/^[0-9a-f]{8}-/);
  });
});

describe('AsyncLocalStorage request context', () => {
  it('isolates interleaved async requests, including authenticated actors', async () => {
    const seen = await Promise.all([
      requestContext.run({ requestId: 'first' }, async () => {
        requestContext.setActor({ id: 'user-1', type: 'USER' });
        await new Promise((resolve) => setTimeout(resolve, 20));
        return requestContext.current();
      }),
      requestContext.run({ requestId: 'second' }, async () => {
        requestContext.setActor({ id: 'app-2', type: 'MACHINE' });
        await new Promise((resolve) => setTimeout(resolve, 5));
        return requestContext.current();
      }),
    ]);
    expect(seen).toEqual([
      { requestId: 'first', actor: { id: 'user-1', type: 'USER' } },
      { requestId: 'second', actor: { id: 'app-2', type: 'MACHINE' } },
    ]);
    expect(requestContext.current()).toBeUndefined();
  });
});

describe('JsonLogger', () => {
  it('writes parseable JSON with automatic correlation and redacted credentials', () => {
    const lines: string[] = [];
    const logger = new JsonLogger({
      level: 'debug',
      service: 'backend-test',
      writer: (line) => lines.push(line),
    });
    requestContext.run({ requestId: 'req-1' }, () => {
      requestContext.setActor({ id: 'user-7', type: 'USER' });
      logger.log({
        event: 'business.example',
        contextData: { authorization: 'Bearer abc', password: 'sensitive', safe: 'value' },
        tokens: [{ apiKey: 'secret', other: 1 }],
        requestId: 'forged',
      }, 'OrdersService');
    });
    expect(lines).toHaveLength(1);
    const record = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(record).toMatchObject({
      message: 'business.example',
      event: 'business.example',
      level: 'info',
      service: 'backend-test',
      context: 'OrdersService',
      requestId: 'req-1',
      actorId: 'user-7',
      actorType: 'USER',
      contextData: {
        authorization: '[REDACTED]',
        password: '[REDACTED]',
        safe: 'value',
      },
    });
    expect(record.timestamp).toEqual(expect.any(String));
    expect(lines[0]).not.toContain('Bearer abc');
    expect(lines[0]).not.toContain('sensitive');
    expect(lines[0]).not.toContain('secret');
  });

  it('applies LOG_LEVEL without hiding warn/errors and uses stderr for errors', () => {
    const severities: string[] = [];
    const logger = new JsonLogger({
      level: 'warn',
      writer: (_line, severity) => severities.push(severity),
    });
    logger.log('ignored');
    logger.debug('ignored');
    logger.warn('warning');
    logger.error({ event: 'http.error', error: new Error('broken') });
    expect(severities).toEqual(['warn', 'error']);
  });

  it('never crashes logging on circular metadata or deeply nested structures', () => {
    const lines: string[] = [];
    const logger = new JsonLogger({ writer: (line) => lines.push(line) });
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    logger.log({ event: 'circular', data: circular });
    expect(JSON.parse(lines[0]!)).toMatchObject({
      event: 'circular',
      data: { self: '[Circular]' },
    });
  });

  it('serializes shared references in a DAG without incorrectly flagging them circular', () => {
    const lines: string[] = [];
    const logger = new JsonLogger({ writer: (line) => lines.push(line) });
    const metadata = { name: 'shared-config', options: [1, 2] };
    logger.log({
      event: 'shared-reference',
      first: metadata,
      second: metadata,
      list: [metadata, metadata],
    });
    const record = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(record).toMatchObject({
      first: { name: 'shared-config', options: [1, 2] },
      second: { name: 'shared-config', options: [1, 2] },
      list: [metadata, metadata],
    });
    expect(lines[0]).not.toContain('[Circular]');
  });

  it('redacts sensitive fields but preserves legitimate query and body metrics', () => {
    const lines: string[] = [];
    const logger = new JsonLogger({ writer: (line) => lines.push(line) });
    logger.log({
      event: 'metrics',
      queryDurationMs: 17,
      slowQueryCount: 2,
      isQueryCached: true,
      bodySize: 1024,
      query: 'SELECT secret FROM users',
      body: { password: 'secret' },
      headers: { cookie: 'session=secret' },
      payload: 'do-not-log',
      accessToken: 'token-secret',
    });
    const record = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(record).toMatchObject({
      queryDurationMs: 17,
      slowQueryCount: 2,
      isQueryCached: true,
      bodySize: 1024,
      query: '[REDACTED]',
      body: '[REDACTED]',
      headers: '[REDACTED]',
      payload: '[REDACTED]',
      accessToken: '[REDACTED]',
    });
    expect(lines[0]).not.toContain('SELECT secret');
    expect(lines[0]).not.toContain('session=secret');
  });

  it('preserves nested Error causes and system error codes while detecting cause cycles', () => {
    const lines: string[] = [];
    const logger = new JsonLogger({ writer: (line) => lines.push(line) });
    const cause = Object.assign(new Error('connection refused'), {
      code: 'ECONNREFUSED',
      syscall: 'connect',
    });
    const error = Object.assign(new Error('database unavailable', { cause }), {
      code: 'DB_UNAVAILABLE',
    });
    logger.error({ event: 'db.failed', error });
    const record = JSON.parse(lines[0]!) as {
      error: {
        name: string;
        stack: string;
        message: string;
        code: string;
        cause: { name: string; message: string; code: string };
      };
    };
    expect(record.error).toMatchObject({
      name: 'Error',
      message: 'database unavailable',
      code: 'DB_UNAVAILABLE',
      cause: {
        name: 'Error',
        message: 'connection refused',
        code: 'ECONNREFUSED',
      },
    });
    expect(record.error.stack).toContain('database unavailable');

    const cycle: Error = new Error('cyclic cause');
    cycle.cause = cycle;
    logger.error({ event: 'cyclic.error', error: cycle });
    const cyclic = JSON.parse(lines[1]!) as { error: { cause: string } };
    expect(cyclic.error.cause).toBe('[Circular]');
  });

  it('accepts Nest-compatible variadic context and error signatures without fake stacks', () => {
    const lines: string[] = [];
    const logger = new JsonLogger({ level: 'debug', writer: (line) => lines.push(line) });
    logger.log('created', 'extra', 'OrdersService');
    logger.warn('slow', { queryDurationMs: 9 }, 'DbAdapter');
    logger.debug('debugged', 'DebugContext');
    logger.verbose('verbose', 'VerboseContext');
    logger.fatal('fatal', 'FatalContext');
    logger.error({ event: 'failure' }, undefined, 'GlobalExceptionFilter');
    logger.error('trace failure', 'Error: failed\n    at operation', 'Worker');
    logger.error('without trace', 'Worker');
    logger.error('single stack', 'Error: failed\n    at operation');

    const records = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(records[0]).toMatchObject({
      message: 'created', context: 'OrdersService', params: ['extra'],
    });
    expect(records[1]).toMatchObject({
      message: 'slow', context: 'DbAdapter', params: [{ queryDurationMs: 9 }],
    });
    expect(records[2]?.context).toBe('DebugContext');
    expect(records[3]?.context).toBe('VerboseContext');
    expect(records[4]?.context).toBe('FatalContext');
    expect(records[5]).toMatchObject({
      event: 'failure', context: 'GlobalExceptionFilter',
    });
    expect(records[5]).not.toHaveProperty('stack');
    expect(records[6]).toMatchObject({
      context: 'Worker', stack: 'Error: failed\n    at operation',
    });
    expect(records[7]).toMatchObject({
      message: 'without trace', context: 'Worker',
    });
    expect(records[7]).not.toHaveProperty('stack');
    expect(records[8]).toMatchObject({ stack: 'Error: failed\n    at operation' });
    expect(records[8]).not.toHaveProperty('context');
  });

  it('handles Nest Logger forwarding in the global exception filter without context-as-stack', () => {
    const lines: string[] = [];
    const logger = new JsonLogger({ writer: (line) => lines.push(line) });
    const previousLogger = new Logger().localInstance;
    Logger.overrideLogger(logger);
    try {
      const forwarded = new Logger('NestedService');
      forwarded.log('forwarded', 'extra');
      forwarded.error({ event: 'business.failure' });

      const response = {
        status: (status: number) => { expect(status).toBe(500); return response; },
        type: (contentType: string) => { expect(contentType).toBe('application/problem+json'); return response; },
        json: (body: unknown) => body,
      };
      const host = {
        switchToHttp: () => ({ getResponse: () => response }),
      } as unknown as ArgumentsHost;
      const error = Object.assign(
        new Error('database unavailable', { cause: new Error('connection lost') }),
        { code: 'ECONNRESET' },
      );
      new GlobalExceptionFilter().catch(error, host);

      const records = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
      expect(records[0]).toMatchObject({
        context: 'NestedService',
        message: 'forwarded',
        params: ['extra'],
      });
      expect(records[1]).toMatchObject({
        context: 'NestedService', event: 'business.failure',
      });
      expect(records[1]).not.toHaveProperty('stack');
      expect(records[2]).toMatchObject({
        context: 'GlobalExceptionFilter',
        event: 'http.unhandled_exception',
        statusCode: 500,
        error: {
          code: 'ECONNRESET',
          message: 'database unavailable',
          cause: { message: 'connection lost' },
        },
      });
      expect(records[2]).not.toHaveProperty('stack');
    } finally {
      Logger.overrideLogger(previousLogger);
    }
  });
});
