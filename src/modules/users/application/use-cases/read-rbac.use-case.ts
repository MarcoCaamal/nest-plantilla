import { Result, type Result as ResultType } from '@/shared/core/result';
import type { Principal } from '@/shared/domain/auth/principal';
import { RoleRepositoryPort, type RoleInfo } from '../../domain/ports/role-repository.port';
import { PermissionRepositoryPort, type PermissionInfo } from '../../domain/ports/permission-repository.port';
import type { RbacError } from './manage-rbac.use-case';

export class ReadRbacUseCase {
  constructor(
    private readonly roles: RoleRepositoryPort,
    private readonly permissions: PermissionRepositoryPort,
  ) {}

  async listRoles(actor: Principal): Promise<ResultType<readonly RoleInfo[], RbacError>> {
    if (!actor.permissions.includes('roles:read')) return Result.err({ type: 'FORBIDDEN' });
    return Result.ok(await this.roles.list());
  }

  async getRole(actor: Principal, key: string): Promise<ResultType<RoleInfo, RbacError>> {
    if (!actor.permissions.includes('roles:read')) return Result.err({ type: 'FORBIDDEN' });
    const role = await this.roles.findByKey(key);
    return role ? Result.ok(role) : Result.err({ type: 'NOT_FOUND' });
  }

  async listPermissions(actor: Principal): Promise<ResultType<readonly PermissionInfo[], RbacError>> {
    if (!actor.permissions.includes('permissions:read')) return Result.err({ type: 'FORBIDDEN' });
    return Result.ok(await this.permissions.list());
  }

  async getPermission(actor: Principal, key: string): Promise<ResultType<PermissionInfo, RbacError>> {
    if (!actor.permissions.includes('permissions:read')) return Result.err({ type: 'FORBIDDEN' });
    const permission = await this.permissions.findByKey(key);
    return permission ? Result.ok(permission) : Result.err({ type: 'NOT_FOUND' });
  }
}
