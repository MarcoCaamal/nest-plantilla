import { Result, type Result as ResultType } from '@/shared/core/result';
import type { Principal } from '@/shared/domain/auth/principal';
import { IdGeneratorPort } from '@/shared/application/ports/id-generator.port';
import { UnitOfWorkPort } from '@/shared/application/ports/unit-of-work.port';
import { UserRepositoryPort } from '../../domain/ports/user-repository.port';
import { RoleRepositoryPort, type RoleChanges, type RoleInfo } from '../../domain/ports/role-repository.port';
import { UsersPolicy } from '../../domain/policies/users.policy';

export type RbacError =
  | { readonly type: 'FORBIDDEN' }
  | { readonly type: 'NOT_FOUND' }
  | { readonly type: 'CONFLICT' }
  | { readonly type: 'PROTECTED_ROLE' };

export class ManageRbacUseCase {
  constructor(
    private readonly users: UserRepositoryPort,
    private readonly roles: RoleRepositoryPort,
    private readonly policy: UsersPolicy,
    private readonly ids: IdGeneratorPort,
    private readonly uow: UnitOfWorkPort,
  ) {}

  async createRole(
    actor: Principal, key: string, name: string, description?: string,
  ): Promise<ResultType<RoleInfo, RbacError>> {
    if (!actor.permissions.includes('roles:write')) return Result.err({ type: 'FORBIDDEN' });
    return this.uow.runInTransaction<RoleInfo, RbacError>(async () => {
      const id = this.ids.generate();
      const created = await this.roles.create({ id, key, name, ...(description === undefined ? {} : { description }) });
      return created
        ? Result.ok({ id, key, name, description: description ?? null, permissions: [] })
        : Result.err({ type: 'CONFLICT' });
    });
  }

  async updateRole(
    actor: Principal, key: string, changes: RoleChanges,
  ): Promise<ResultType<RoleInfo, RbacError>> {
    if (!actor.permissions.includes('roles:write')) return Result.err({ type: 'FORBIDDEN' });
    // Role keys are immutable identifiers used in authorization and assignments.
    return this.uow.runInTransaction<RoleInfo, RbacError>(async () => {
      if (!await this.roles.update(key, changes)) return Result.err({ type: 'NOT_FOUND' });
      const updated = await this.roles.findByKey(key);
      return updated ? Result.ok(updated) : Result.err({ type: 'NOT_FOUND' });
    });
  }

  async deleteRole(actor: Principal, key: string): Promise<ResultType<void, RbacError>> {
    if (!actor.permissions.includes('roles:write')) return Result.err({ type: 'FORBIDDEN' });
    // The only built-in privileged role must remain available for recovery.
    if (key === 'admin') return Result.err({ type: 'PROTECTED_ROLE' });
    return this.uow.runInTransaction<void, RbacError>(async () =>
      await this.roles.delete(key) ? Result.ok(undefined) : Result.err({ type: 'NOT_FOUND' }));
  }

  async grantPermission(
    actor: Principal, roleKey: string, permissionKey: string,
  ): Promise<ResultType<void, RbacError>> {
    if (!actor.permissions.includes('roles:write')) return Result.err({ type: 'FORBIDDEN' });
    return this.uow.runInTransaction<void, RbacError>(async () =>
      await this.roles.grantPermission(roleKey, permissionKey, this.ids.generate())
        ? Result.ok(undefined) : Result.err({ type: 'NOT_FOUND' }));
  }

  async revokePermission(
    actor: Principal, roleKey: string, permissionKey: string,
  ): Promise<ResultType<void, RbacError>> {
    if (!actor.permissions.includes('roles:write')) return Result.err({ type: 'FORBIDDEN' });
    // The built-in administrator role must retain its seeded permissions.
    if (roleKey === 'admin') return Result.err({ type: 'PROTECTED_ROLE' });
    return this.uow.runInTransaction<void, RbacError>(async () =>
      await this.roles.revokePermission(roleKey, permissionKey)
        ? Result.ok(undefined) : Result.err({ type: 'NOT_FOUND' }));
  }

  async assignRole(actor: Principal, userId: string, roleKey: string): Promise<ResultType<void, RbacError>> {
    if (!actor.permissions.includes('users:write')) return Result.err({ type: 'FORBIDDEN' });
    return this.uow.runInTransaction<void, RbacError>(async () => {
      const user = await this.users.findById(userId);
      if (!user) return Result.err({ type: 'NOT_FOUND' });
      if (!this.policy.authorize(actor, 'write', user).ok) return Result.err({ type: 'FORBIDDEN' });
      const success = await this.users.assignRole(userId, roleKey, this.ids.generate());
      return success ? Result.ok(undefined) : Result.err({ type: 'NOT_FOUND' });
    });
  }

  async removeRole(actor: Principal, userId: string, roleKey: string): Promise<ResultType<void, RbacError>> {
    if (!actor.permissions.includes('users:write')) return Result.err({ type: 'FORBIDDEN' });
    return this.uow.runInTransaction<void, RbacError>(async () => {
      const user = await this.users.findById(userId);
      if (!user) return Result.err({ type: 'NOT_FOUND' });
      if (!this.policy.authorize(actor, 'write', user).ok) return Result.err({ type: 'FORBIDDEN' });
      const outcome = await this.users.removeRole(userId, roleKey);
      switch (outcome) {
        case 'REMOVED': return Result.ok(undefined);
        case 'LAST_ADMIN': return Result.err({ type: 'PROTECTED_ROLE' });
        case 'NOT_FOUND': return Result.err({ type: 'NOT_FOUND' });
      }
    });
  }
}
