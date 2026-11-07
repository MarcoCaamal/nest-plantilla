import { Module } from '@nestjs/common';
import { HealthController } from './shared/infrastructure/http/health.controller';
import { AuthzModule } from './modules/authz/public';

/** Add feature modules here; no technology adapters are preselected. */
@Module({ imports: [AuthzModule], controllers: [HealthController] })
export class AppModule {}
