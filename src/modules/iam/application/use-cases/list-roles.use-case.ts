import { Result, type Result as ResultType } from '@/shared/core/result';
import type { Principal } from '@/shared/domain/auth/principal';
import type { Role } from '../../domain/entities/role.entity';
import type { IamError } from '../../domain/errors/iam.error';
import { RoleRepositoryPort } from '../ports/role-repository.port';

export class ListRolesUseCase {
  constructor(private readonly roles: RoleRepositoryPort) {}

  async execute(actor: Principal): Promise<ResultType<readonly Role[], IamError>> {
    if (!actor.permissions.includes('roles:read')) return Result.err({ type: 'FORBIDDEN' });
    return Result.ok(await this.roles.list());
  }

  async get(actor: Principal, key: string): Promise<ResultType<Role, IamError>> {
    if (!actor.permissions.includes('roles:read')) return Result.err({ type: 'FORBIDDEN' });
    const role = await this.roles.findByKey(key);
    return role ? Result.ok(role) : Result.err({ type: 'NOT_FOUND' });
  }
}
