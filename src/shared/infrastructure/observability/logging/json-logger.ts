import type { LoggerService } from '@nestjs/common';
import pino from 'pino';
import {
  logs, SeverityNumber, context as otelContext, trace as otelTrace, TraceFlags,
} from '@opentelemetry/api';
import { requestContext } from '../context/request-context';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';
type Severity = Exclude<LogLevel, 'silent'>;
export type LogWriter = (line: string, severity: Severity) => void;

const rank: Record<Severity, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};


export interface JsonLoggerOptions {
  readonly level?: LogLevel;
  readonly service?: string;
  /** Only for testing or explicitly chosen transports; production defaults to stdout/stderr. */
  readonly writer?: LogWriter;
}

const secretField = /(?:authorization|cookie|credential|password|passwd|secret|private.?key|api.?key|access.?token|refresh.?token|id.?token|^headers$|^body$|^query$|^payload$)/i;
const MAX_DEPTH = 5;
const MAX_FIELDS = 40;
const MAX_ITEMS = 40;
const MAX_STRING = 8192;

function sanitize(value: unknown, depth = 0, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.length > MAX_STRING ? value.slice(0, MAX_STRING) + '…' : value;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value !== 'object') return String(value);
  if (seen.has(value)) return '[Circular]';
  if (depth >= MAX_DEPTH) return '[Truncated]';
  seen.add(value);
  try {
    if (value instanceof Error) {
      const error: Record<string, unknown> = {
        name: value.name,
        message: value.message,
        stack: value.stack,
      };
      if ('code' in value) error.code = value.code;
      if (value.cause !== undefined) error.cause = value.cause;
      return sanitize(error, depth + 1, seen);
    }
    if (Array.isArray(value)) {
      return value.slice(0, MAX_ITEMS).map((item) => sanitize(item, depth + 1, seen));
    }
    const entries = Object.entries(value).slice(0, MAX_FIELDS).map(([key, entry]) => [
      key,
      secretField.test(key) ? '[REDACTED]' : sanitize(entry, depth + 1, seen),
    ]);
    return Object.fromEntries(entries);
  } finally {
    // Only an ancestor on the active recursion path is a true cycle.
    // Unmark on return so shared references (DAGs) serialize normally.
    seen.delete(value);
  }
}

// Pino is the production log engine. JsonLogger still sanitizes metadata and
// provides the stable Nest / test-writer interface from main.
const productionLogger = pino({
  level: 'debug',
  base: null,
  timestamp: false,
  formatters: { level: (label) => ({ severity: label }) },
  redact: { paths: ['password', 'token', 'authorization', 'apiKey', 'headers', 'body'], censor: '[REDACTED]' },
});

function defaultWrite(line: string, severity: Severity): void {
  productionLogger[severity](JSON.parse(line) as object);
}

/**
 * Structured Nest logger with Pino transport and automatic ALS correlation.
 * Callers should log named fields, not arbitrary request bodies or token strings.
 */
export class JsonLogger implements LoggerService {
  private level: LogLevel;
  private service: string;
  private readonly writer: LogWriter;

  constructor(options: JsonLoggerOptions = {}) {
    this.level = options.level ?? 'info';
    this.service = options.service ?? 'nest-plantilla';
    this.writer = options.writer ?? defaultWrite;
  }

  /** Called exactly once from the validated bootstrap, before Nest starts. */
  configure(config: { readonly level: LogLevel; readonly service: string }): void {
    this.level = config.level;
    this.service = config.service;
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.writeWithParams('info', message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.writeWithParams('warn', message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.writeWithParams('debug', message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.writeWithParams('debug', message, optionalParams);
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.writeWithParams('error', message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    // Nest Logger('Context').error(message) forwards [undefined, 'Context'];
    // .error(message, stack) forwards [stack, 'Context']. Without a
    // contextual logger a lone string can be either stack or context.
    const params = [...optionalParams];
    const last = params.at(-1);
    const loneStack = params.length === 1 && typeof last === 'string' &&
      /(?:^|\n)\s*at\s|\n|^\w*Error:/.test(last);
    const context = !loneStack && typeof last === 'string'
      ? params.pop() as string : undefined;
    const remaining = params.filter((param) => param !== undefined);
    const trace = remaining.length > 0 && typeof remaining[0] === 'string'
      ? remaining.shift() as string : undefined;

    this.write('error', message, context, trace, remaining);
  }

  private writeWithParams(
    level: Severity,
    message: unknown,
    optionalParams: unknown[],
  ): void {
    // Nest's final string is the context, not always the first optional param.
    const params = [...optionalParams];
    const context = typeof params.at(-1) === 'string'
      ? params.pop() as string : undefined;
    this.write(level, message, context, undefined, params);
  }

  private write(
    level: Severity,
    message: unknown,
    context?: string,
    trace?: string,
    params: readonly unknown[] = [],
  ): void {
    if (this.level === 'silent' || rank[level] < rank[this.level]) return;

    const data = sanitize(message);
    const fields = data !== null && typeof data === 'object' && !Array.isArray(data)
      ? data as Record<string, unknown> : {};
    const messageText = typeof data === 'string' ? data
      : typeof fields.message === 'string' ? fields.message
        : typeof fields.event === 'string' ? fields.event : 'log';
    const correlation = requestContext.current();

    const record = {
      ...fields,
      timestamp: new Date().toISOString(),
      level,
      service: this.service,
      message: messageText,
      ...(context ? { context } : {}),
      ...(trace ? { stack: sanitize(trace) } : {}),
      ...(params.length > 0 ? { params: sanitize(params) } : {}),
      ...(correlation ? {
        requestId: correlation.requestId,
        ...(correlation.traceId ? { traceId: correlation.traceId } : {}),
        ...(correlation.spanId ? { spanId: correlation.spanId } : {}),
        ...(correlation.actor ? {
          actorId: correlation.actor.id,
          actorType: correlation.actor.type,
        } : {}),
      } : {}),
    };

    this.writer(JSON.stringify(record), level);
    // The SDK's global provider is a no-op unless tracing.ts registered OTLP.
    // Keep the OTel attributes scalar and already redacted by sanitize().
    const logAttributes: Record<string, string | number | boolean> = {};
    for (const key of ['event', 'requestId', 'traceId', 'spanId', 'actorId', 'actorType', 'statusCode', 'service']) {
      const value: unknown = record[key as keyof typeof record];
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        logAttributes[key] = value;
      }
    }
    // Include the original request span as native OTLP trace context, even
    // when the HTTP completion callback fires outside its active span.
    const logContext = correlation?.traceId && correlation.spanId
      ? otelTrace.setSpanContext(otelContext.active(), {
        traceId: correlation.traceId,
        spanId: correlation.spanId,
        traceFlags: TraceFlags.SAMPLED,
      }) : undefined;
    logs.getLogger('nest-plantilla').emit({
      ...(logContext ? { context: logContext } : {}),
      body: messageText,
      severityText: level.toUpperCase(),
      severityNumber: {
        debug: SeverityNumber.DEBUG, info: SeverityNumber.INFO,
        warn: SeverityNumber.WARN, error: SeverityNumber.ERROR,
      }[level],
      attributes: logAttributes,
    });
  }
}

export const jsonLogger = new JsonLogger();
