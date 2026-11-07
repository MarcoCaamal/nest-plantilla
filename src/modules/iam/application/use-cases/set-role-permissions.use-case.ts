import { Result, type Result as ResultType } from '@/shared/core/result';
import type { Principal } from '@/shared/domain/auth/principal';
import { UnitOfWorkPort } from '@/shared/application/ports/unit-of-work.port';
import { IdGeneratorPort } from '@/shared/application/ports/id-generator.port';
import type { IamError } from '../../domain/errors/iam.error';
import { RoleRepositoryPort } from '../ports/role-repository.port';

/** Grants and revokes only existing catalog permissions; no permission CRUD here. */
export class SetRolePermissionsUseCase {
  constructor(private readonly roles: RoleRepositoryPort, private readonly ids: IdGeneratorPort, private readonly uow: UnitOfWorkPort) {}

  async grant(actor: Principal, roleKey: string, permissionKey: string): Promise<ResultType<void, IamError>> {
    if (!actor.permissions.includes('roles:write')) return Result.err({ type: 'FORBIDDEN' });
    return this.uow.runInTransaction<void, IamError>(async () =>
      await this.roles.grantPermission(roleKey, permissionKey, this.ids.generate())
        ? Result.ok(undefined) : Result.err({ type: 'NOT_FOUND' }));
  }

  async revoke(actor: Principal, roleKey: string, permissionKey: string): Promise<ResultType<void, IamError>> {
    if (!actor.permissions.includes('roles:write')) return Result.err({ type: 'FORBIDDEN' });
    if (roleKey === 'admin') return Result.err({ type: 'PROTECTED_ROLE' });
    return this.uow.runInTransaction<void, IamError>(async () =>
      await this.roles.revokePermission(roleKey, permissionKey)
        ? Result.ok(undefined) : Result.err({ type: 'NOT_FOUND' }));
  }
}
