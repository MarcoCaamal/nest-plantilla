import { randomUUID } from 'node:crypto';
import { type IncomingMessage, type ServerResponse } from 'node:http';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { PrincipalType } from '@/shared/domain/auth/principal';
import { requestContext } from '../context/request-context';
import { JsonLogger } from '../logging/json-logger';

type HttpRequest = IncomingMessage & {
  readonly route?: { readonly path?: string };
  readonly baseUrl?: string;
  readonly principal?: { readonly id: string; readonly type: PrincipalType };
};
type HttpResponse = ServerResponse<IncomingMessage>;
type Next = (error?: unknown) => void;

// Accept simple printable IDs only; never echo unchecked values in headers/logs.
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export function resolveRequestId(inbound: string | readonly string[] | undefined): string {
  return typeof inbound === 'string' && REQUEST_ID_PATTERN.test(inbound)
    ? inbound : randomUUID();
}

/**
 * Runs before guards, pipes and controllers. `finish` is also reached on 401/403/500;
 * `close` covers aborted connections. Each request produces exactly one completion.
 */
@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  constructor(private readonly logger: JsonLogger) {}

  use(request: HttpRequest, response: HttpResponse, next: Next): void {
    const requestId = resolveRequestId(request.headers['x-request-id']);
    const initialContext = { requestId };
    const startedAt = process.hrtime.bigint();
    response.setHeader('X-Request-ID', requestId);

    let recorded = false;
    const finish = (outcome: 'completed' | 'aborted'): void => {
      if (recorded) return;
      recorded = true;
      response.off('finish', onFinish);
      response.off('close', onClose);

      const elapsed = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      // Express's resolved path is a route template, not a user-supplied URL or query.
      const routePath = request.route?.path;
      const route = typeof routePath === 'string'
        ? (request.baseUrl ?? '') + routePath : 'unmatched';
      const event = {
        event: 'http.request.completed',
        method: request.method ?? 'UNKNOWN',
        route,
        outcome,
        // 499 is a log-only sentinel for clients that disconnect before response.
        statusCode: outcome === 'aborted' ? 499 : response.statusCode,
        durationMs: Math.round(elapsed * 100) / 100,
      };
      // EventEmitter callbacks may run outside the original async context.
      const current = requestContext.current();
      // Guards attach the trusted principal to the request. Keep actor correlation
      // even if the response event fires from a different ALS execution context.
      const actor = request.principal;
      const context = {
        ...(current?.requestId === requestId ? current : initialContext),
        ...(actor ? { actor: { id: actor.id, type: actor.type } } : {}),
      };
      requestContext.run(context, () => {
        if (outcome === 'aborted' || response.statusCode >= 500) {
          this.logger.warn(event, RequestLoggingMiddleware.name);
        } else {
          this.logger.log(event, RequestLoggingMiddleware.name);
        }
      });
    };
    const onFinish = (): void => finish('completed');
    const onClose = (): void => {
      if (!response.writableFinished) finish('aborted');
    };

    response.once('finish', onFinish);
    response.once('close', onClose);
    requestContext.run(initialContext, () => next());
  }
}
