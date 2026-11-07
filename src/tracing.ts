/**
 * Load with node --import ./dist/tracing.js dist/main.js, before app import.
 * With no OTLP endpoint it creates no exporters and does not instrument.
 * OTLP HTTP path for OpenObserve: /api/default/v1/traces.
 */
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { PrismaInstrumentation } from '@prisma/instrumentation';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
if (endpoint) {
  const headers = Object.fromEntries(
    (process.env.OTEL_EXPORTER_OTLP_HEADERS ?? '')
      .split(',').filter(Boolean).map((entry) => {
        const separator = entry.indexOf('=');
        if (separator === -1) throw new Error('Invalid OTLP headers configuration');
        return [entry.slice(0, separator).trim(), entry.slice(separator + 1).trim()];
      }),
  );
  // Compose local credentials may be used without constructing an auth header.
  // Explicit OTLP headers take precedence.
  const username = process.env.OPENOBSERVE_USERNAME;
  const password = process.env.OPENOBSERVE_PASSWORD;
  if (username && password && !headers.Authorization) {
    headers.Authorization = 'Basic ' + Buffer.from(username + ':' + password).toString('base64');
  }
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.SERVICE_NAME ?? 'nest-plantilla',
    }),
    traceExporter: new OTLPTraceExporter({ url: endpoint, headers }),
    // The preset exports only traces and logs, not auto-configured metrics.
    metricReaders: [],
    logRecordProcessors: [
      new BatchLogRecordProcessor({ exporter: new OTLPLogExporter({
        url: endpoint.replace(/\/v1\/traces\/?$/, '/v1/logs'), headers,
      }) }),
    ],
    instrumentations: [
      new HttpInstrumentation(),
      new ExpressInstrumentation(),
      new PrismaInstrumentation(),
      // Intentionally do not instrument fs or dns.
    ],
  });
  sdk.start();
  process.once('SIGTERM', () => { void sdk.shutdown(); });
  process.once('SIGINT', () => { void sdk.shutdown(); });
}
