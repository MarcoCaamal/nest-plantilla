import { Result, type Result as ResultType } from '@/shared/core/result';
import type { Principal } from '@/shared/domain/auth/principal';
import { IdGeneratorPort } from '@/shared/application/ports/id-generator.port';
import { UnitOfWorkPort } from '@/shared/application/ports/unit-of-work.port';
import { UserRepositoryPort } from '../../domain/ports/user-repository.port';
import { RoleRepositoryPort } from '../../domain/ports/role-repository.port';
import { UsersPolicy } from '../../domain/policies/users.policy';

export type RbacError =
  | { readonly type: 'FORBIDDEN' }
  | { readonly type: 'NOT_FOUND' };

export class ManageRbacUseCase {
  constructor(
    private readonly users: UserRepositoryPort,
    private readonly roles: RoleRepositoryPort,
    private readonly policy: UsersPolicy,
    private readonly ids: IdGeneratorPort,
    private readonly uow: UnitOfWorkPort,
  ) {}

  private allowed(actor: Principal): boolean { return actor.permissions.includes('users:write'); }

  async createRole(actor: Principal, key: string, name: string, description?: string): Promise<ResultType<void, RbacError>> {
    if (!this.allowed(actor)) return Result.err({ type: 'FORBIDDEN' });
    return this.uow.runInTransaction<void, RbacError>(async () => {
      await this.roles.create({ id: this.ids.generate(), key, name, ...(description ? { description } : {}) });
      return Result.ok(undefined);
    });
  }

  async createPermission(actor: Principal, key: string): Promise<ResultType<void, RbacError>> {
    if (!this.allowed(actor)) return Result.err({ type: 'FORBIDDEN' });
    await this.roles.createPermission(this.ids.generate(), key);
    return Result.ok(undefined);
  }

  async grantPermission(actor: Principal, roleKey: string, permissionKey: string): Promise<ResultType<void, RbacError>> {
    if (!this.allowed(actor)) return Result.err({ type: 'FORBIDDEN' });
    const success = await this.roles.grantPermission(roleKey, permissionKey, this.ids.generate());
    return success ? Result.ok(undefined) : Result.err({ type: 'NOT_FOUND' });
  }

  async assignRole(actor: Principal, userId: string, roleKey: string): Promise<ResultType<void, RbacError>> {
    if (!this.allowed(actor)) return Result.err({ type: 'FORBIDDEN' });
    return this.uow.runInTransaction<void, RbacError>(async () => {
      const user = await this.users.findById(userId);
      if (!user) return Result.err({ type: 'NOT_FOUND' });
      if (!this.policy.authorize(actor, 'write', user).ok) return Result.err({ type: 'FORBIDDEN' });
      const success = await this.users.assignRole(userId, roleKey, this.ids.generate());
      return success ? Result.ok(undefined) : Result.err({ type: 'NOT_FOUND' });
    });
  }

  async rolesFor(actor: Principal) {
    if (!actor.permissions.includes('users:read')) return Result.err<RbacError>({ type: 'FORBIDDEN' });
    return Result.ok(await this.roles.list());
  }
}
