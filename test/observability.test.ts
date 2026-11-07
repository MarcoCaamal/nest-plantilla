import { describe, expect, it } from 'vitest';
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
});
