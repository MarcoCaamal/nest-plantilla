import { Module } from '@nestjs/common';
import { IdGeneratorPort } from '@/shared/application/ports/id-generator.port';
import { ApiClientsModule } from './api-clients.module';
import { ApiKeyVerifierPort } from './application/ports/api-key-verifier.port';
import { ApiClientRepositoryPort } from './domain/ports/api-client-repository.port';
import { ApiKeyMaterialPort } from './application/ports/api-key-material.port';
import { CreateApiClientUseCase } from './application/use-cases/create-api-client.use-case';
import { PrismaApiKeyVerifierAdapter } from './infrastructure/prisma-api-key-verifier.adapter';
import { PrismaApiClientRepository } from './infrastructure/persistence/prisma-api-client.repository';
import { SecureApiKeyMaterialAdapter } from './infrastructure/api-key-material.adapter';
import { StaffApiClientsController } from './infrastructure/http/staff/staff-api-clients.controller';
import { PartnerIdentityController } from './infrastructure/http/partner-b2b/partner-identity.controller';

@Module({
  imports: [
    ApiClientsModule.register({
      verifier: { provide: ApiKeyVerifierPort, useClass: PrismaApiKeyVerifierAdapter },
    }),
  ],
  controllers: [StaffApiClientsController, PartnerIdentityController],
  providers: [
    PrismaApiClientRepository,
    { provide: ApiClientRepositoryPort, useExisting: PrismaApiClientRepository },
    { provide: ApiKeyMaterialPort, useClass: SecureApiKeyMaterialAdapter },
    {
      provide: CreateApiClientUseCase,
      useFactory: (repo: ApiClientRepositoryPort, material: ApiKeyMaterialPort, ids: IdGeneratorPort) =>
        new CreateApiClientUseCase(repo, material, ids),
      inject: [ApiClientRepositoryPort, ApiKeyMaterialPort, IdGeneratorPort],
    },
  ],
})
export class ApiClientsPresetModule {}
