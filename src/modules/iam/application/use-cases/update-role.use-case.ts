import { Result, type Result as ResultType } from '@/shared/core/result';
import type { Principal } from '@/shared/domain/auth/principal';
import { UnitOfWorkPort } from '@/shared/application/ports/unit-of-work.port';
import type { Role, RoleChanges } from '../../domain/entities/role.entity';
import type { IamError } from '../../domain/errors/iam.error';
import { RoleRepositoryPort } from '../ports/role-repository.port';

export class UpdateRoleUseCase {
  constructor(private readonly roles: RoleRepositoryPort, private readonly uow: UnitOfWorkPort) {}

  async execute(actor: Principal, key: string, changes: RoleChanges): Promise<ResultType<Role, IamError>> {
    if (!actor.permissions.includes('roles:write')) return Result.err({ type: 'FORBIDDEN' });
    return this.uow.runInTransaction<Role, IamError>(async () => {
      if (!await this.roles.update(key, changes)) return Result.err({ type: 'NOT_FOUND' });
      const updated = await this.roles.findByKey(key);
      return updated ? Result.ok(updated) : Result.err({ type: 'NOT_FOUND' });
    });
  }
}
