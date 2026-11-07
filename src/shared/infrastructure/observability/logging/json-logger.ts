import type { LoggerService } from '@nestjs/common';
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

function logLevel(raw: string | undefined): LogLevel {
  switch (raw?.toLowerCase()) {
    case 'debug': return 'debug';
    case 'warn': return 'warn';
    case 'error': return 'error';
    case 'silent': return 'silent';
    default: return 'info';
  }
}

export interface JsonLoggerOptions {
  readonly level?: LogLevel;
  readonly service?: string;
  /** Only for testing or explicitly chosen transports; production defaults to stdout/stderr. */
  readonly writer?: LogWriter;
}

const secretField = /(?:authorization|cookie|credential|password|passwd|secret|private.?key|api.?key|access.?token|refresh.?token|id.?token|headers|body|query|payload)/i;
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
  if (value instanceof Error) {
    return sanitize({ name: value.name, message: value.message, stack: value.stack }, depth + 1, seen);
  }
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ITEMS).map((item) => sanitize(item, depth + 1, seen));
  }
  const entries = Object.entries(value).slice(0, MAX_FIELDS).map(([key, entry]) => [
    key,
    secretField.test(key) ? '[REDACTED]' : sanitize(entry, depth + 1, seen),
  ]);
  return Object.fromEntries(entries);
}

function defaultWrite(line: string, severity: Severity): void {
  if (severity === 'error') process.stderr.write(line + '\n');
  else process.stdout.write(line + '\n');
}

/**
 * Minimal structured Nest logger with automatic ALS correlation. No Pino/Winston.
 * Callers should log named fields, not arbitrary request bodies or token strings.
 */
export class JsonLogger implements LoggerService {
  private readonly level: LogLevel;
  private readonly service: string;
  private readonly writer: LogWriter;

  constructor(options: JsonLoggerOptions = {}) {
    this.level = options.level ?? logLevel(process.env.LOG_LEVEL);
    this.service = options.service ?? process.env.SERVICE_NAME ?? 'nest-plantilla';
    this.writer = options.writer ?? defaultWrite;
  }

  log(message: unknown, context?: string): void { this.write('info', message, context); }
  warn(message: unknown, context?: string): void { this.write('warn', message, context); }
  debug(message: unknown, context?: string): void { this.write('debug', message, context); }
  verbose(message: unknown, context?: string): void { this.write('debug', message, context); }
  fatal(message: unknown, context?: string): void { this.write('error', message, context); }

  error(message: unknown, trace?: string, context?: string): void {
    this.write('error', message, context, trace);
  }

  private write(level: Severity, message: unknown, context?: string, trace?: string): void {
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
  }
}

export const jsonLogger = new JsonLogger();
