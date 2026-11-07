import { IdGeneratorPort } from '@/shared/application/ports/id-generator.port';
import { Result } from '@/shared/core/result';
import type { Principal } from '@/shared/domain/auth/principal';
import { ApiClientRepositoryPort } from '../../domain/ports/api-client-repository.port';
import { ApiKeyMaterialPort } from '../ports/api-key-material.port';

export class CreateApiClientUseCase {
  constructor(
    private readonly repo: ApiClientRepositoryPort,
    private readonly material: ApiKeyMaterialPort,
    private readonly ids: IdGeneratorPort,
  ) {}

  async execute(actor: Principal, input: {
    name: string; permissions: readonly string[]; scopes: readonly string[];
  }) {
    if (!actor.permissions.includes('api-clients:write')) {
      return Result.err({ type: 'FORBIDDEN' as const });
    }
    const key = this.material.generate();
    const id = this.ids.generate();
    const keyPrefix = key.slice(0, 16);
    await this.repo.create({
      id, name: input.name, keyPrefix, keyHash: this.material.digest(key),
      permissions: input.permissions, scopes: input.scopes,
    });
    return Result.ok({ id, key, keyPrefix });
  }
}
