import { Result, type Result as ResultType } from '@/shared/core/result';
import type { Principal } from '@/shared/domain/auth/principal';
import { IdGeneratorPort } from '@/shared/application/ports/id-generator.port';
import { UnitOfWorkPort } from '@/shared/application/ports/unit-of-work.port';
import type { Role } from '../../domain/entities/role.entity';
import type { IamError } from '../../domain/errors/iam.error';
import { RoleRepositoryPort } from '../ports/role-repository.port';

export class CreateRoleUseCase {
  constructor(private readonly roles: RoleRepositoryPort, private readonly ids: IdGeneratorPort, private readonly uow: UnitOfWorkPort) {}

  async execute(actor: Principal, key: string, name: string, description?: string): Promise<ResultType<Role, IamError>> {
    if (!actor.permissions.includes('roles:write')) return Result.err({ type: 'FORBIDDEN' });
    return this.uow.runInTransaction<Role, IamError>(async () => {
      const id = this.ids.generate();
      const created = await this.roles.create({ id, key, name, ...(description === undefined ? {} : { description }) });
      return created
        ? Result.ok({ id, key, name, description: description ?? null, permissions: [] })
        : Result.err({ type: 'CONFLICT' });
    });
  }
}
