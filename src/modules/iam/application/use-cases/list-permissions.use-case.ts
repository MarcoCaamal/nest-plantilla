import { Result, type Result as ResultType } from '@/shared/core/result';
import type { Principal } from '@/shared/domain/auth/principal';
import type { Permission } from '../../domain/entities/permission.entity';
import type { IamError } from '../../domain/errors/iam.error';
import { PermissionRepositoryPort } from '../ports/permission-repository.port';

export class ListPermissionsUseCase {
  constructor(private readonly permissions: PermissionRepositoryPort) {}

  async execute(actor: Principal): Promise<ResultType<readonly Permission[], IamError>> {
    if (!actor.permissions.includes('permissions:read')) return Result.err({ type: 'FORBIDDEN' });
    return Result.ok(await this.permissions.list());
  }

  async get(actor: Principal, key: string): Promise<ResultType<Permission, IamError>> {
    if (!actor.permissions.includes('permissions:read')) return Result.err({ type: 'FORBIDDEN' });
    const permission = await this.permissions.findByKey(key);
    return permission ? Result.ok(permission) : Result.err({ type: 'NOT_FOUND' });
  }
}
