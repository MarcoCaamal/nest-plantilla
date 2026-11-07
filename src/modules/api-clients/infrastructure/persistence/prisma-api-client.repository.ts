import { Injectable } from '@nestjs/common';
import { PrismaHost } from '@/shared/infrastructure/persistence/prisma-unit-of-work';
import {
  ApiClientRepositoryPort, type NewApiClient,
} from '../../domain/ports/api-client-repository.port';

@Injectable()
export class PrismaApiClientRepository extends ApiClientRepositoryPort {
  constructor(private readonly host: PrismaHost) { super(); }

  async create(input: NewApiClient): Promise<void> {
    await this.host.client.apiClient.create({
      data: {
        ...input, scopes: [...input.scopes], permissions: [...input.permissions],
      },
    });
  }
}
