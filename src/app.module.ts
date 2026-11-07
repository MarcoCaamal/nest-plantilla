import { Module } from '@nestjs/common';
import { HealthController } from './shared/infrastructure/http/health.controller';

/** Add feature modules here; no technology adapters are preselected. */
@Module({ controllers: [HealthController] })
export class AppModule {}
