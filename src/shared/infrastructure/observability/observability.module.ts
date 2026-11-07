import {
  Global, MiddlewareConsumer, Module, NestModule, RequestMethod,
} from '@nestjs/common';
import { RequestLoggingMiddleware } from './http/request-logging.middleware';
import { JsonLogger, jsonLogger } from './logging/json-logger';

/** Framework-only bootstrap. No external SDK, exporter, database or cache. */
@Global()
@Module({
  providers: [
    { provide: JsonLogger, useValue: jsonLogger },
    RequestLoggingMiddleware,
  ],
  exports: [JsonLogger],
})
export class ObservabilityModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestLoggingMiddleware).forRoutes({
      path: '{*path}',
      method: RequestMethod.ALL,
    });
  }
}
