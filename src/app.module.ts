import { Module } from '@nestjs/common';
import { HealthController } from './shared/infrastructure/http/health.controller';
import { AuthzModule } from './modules/authz/public';
import { ObservabilityModule } from './shared/infrastructure/observability/observability.module';

/** Add feature modules here; no technology adapters are preselected. */
@Module({ imports: [ObservabilityModule, AuthzModule], controllers: [HealthController] })
export class AppModule {}
