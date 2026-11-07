import { Result, type Result as ResultType } from '@/shared/core/result';
import type { Principal } from '@/shared/domain/auth/principal';
import { UnitOfWorkPort } from '@/shared/application/ports/unit-of-work.port';
import type { IamError } from '../../domain/errors/iam.error';
import { RoleRepositoryPort } from '../ports/role-repository.port';

export class DeleteRoleUseCase {
  constructor(private readonly roles: RoleRepositoryPort, private readonly uow: UnitOfWorkPort) {}

  async execute(actor: Principal, key: string): Promise<ResultType<void, IamError>> {
    if (!actor.permissions.includes('roles:write')) return Result.err({ type: 'FORBIDDEN' });
    if (key === 'admin') return Result.err({ type: 'PROTECTED_ROLE' });
    return this.uow.runInTransaction<void, IamError>(async () =>
      await this.roles.delete(key) ? Result.ok(undefined) : Result.err({ type: 'NOT_FOUND' }));
  }
}
