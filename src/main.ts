import 'reflect-metadata';
import {
  StandardSchemaValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './shared/infrastructure/http/filters/global-exception.filter';
import { HttpResultInterceptor } from './shared/infrastructure/http/interceptors/http-result.interceptor';

export async function bootstrap(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new HttpResultInterceptor());

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder().setTitle('Nest Plantilla').setVersion('0.1.0').build(),
  );
  SwaggerModule.setup('docs', app, document);

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  return app;
}

if (require.main === module) {
  // Bootstrap errors are technical panics. No business Result here.
  void bootstrap().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
