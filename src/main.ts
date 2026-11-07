import 'reflect-metadata';
import {
  Module,
  StandardSchemaValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AppConfig, ConfigModule, parseEnv } from './shared/infrastructure/config/app-config';
import { GlobalExceptionFilter } from './shared/infrastructure/http/filters/global-exception.filter';
import { HttpResultInterceptor } from './shared/infrastructure/http/interceptors/http-result.interceptor';
import { jsonLogger } from './shared/infrastructure/observability/logging/json-logger';

export async function bootstrap(): Promise<INestApplication> {
  // Validate before constructing Nest or opening network ports.
  const config = new AppConfig(parseEnv());
  jsonLogger.configure({
    level: config.get('LOG_LEVEL'),
    service: config.get('SERVICE_NAME'),
  });

  @Module({ imports: [AppModule, ConfigModule.register(config)] })
  class ConfiguredAppModule {}

  const app = await NestFactory.create(ConfiguredAppModule, { logger: jsonLogger });
  app.enableShutdownHooks();
  // The base template uses the Express HTTP platform.
  (app.getHttpAdapter().getInstance() as { disable(header: string): void })
    .disable('x-powered-by');
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new HttpResultInterceptor());

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder().setTitle('Nest Plantilla').setVersion('0.1.0').build(),
  );
  SwaggerModule.setup('docs', app, document);

  const port = config.get('PORT');
  await app.listen(port);
  return app;
}

if (require.main === module) {
  // Bootstrap errors are technical panics. No business Result here.
  void bootstrap().catch((error: unknown) => {
    jsonLogger.error({
      event: 'bootstrap.failed',
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : { name: 'UnknownError' },
    });
    process.exitCode = 1;
  });
}
