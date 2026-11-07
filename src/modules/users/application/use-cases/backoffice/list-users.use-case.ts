import type { PageQuery, PageResult } from '@/shared/core/pagination';
import { Result, type Result as ResultType } from '@/shared/core/result';
import type { Principal } from '@/shared/domain/auth/principal';
import type { AuthorizationError } from '@/shared/domain/auth/authorization-error';
import { UserResourcePolicy } from '../../../domain/policies/user-resource.policy';
import { UserRepositoryPort, type UserFilters } from '../../ports/user-repository.port';
import type { SafeUser } from '../../../domain/entities/user.entity';

export class ListUsersUseCase {
  constructor(private readonly users: UserRepositoryPort, private readonly policy: UserResourcePolicy) {}

  async execute(
    actor: Principal, filters: UserFilters, pagination: PageQuery,
  ): Promise<ResultType<PageResult<SafeUser>, AuthorizationError>> {
    if (!actor.permissions.includes('users:read')) {
      return Result.err({ type: 'PERMISSION_DENIED', permission: 'users:read' });
    }
    const scope = this.policy.resolveScope(actor);
    if (!scope.ok) return scope;
    return Result.ok(await this.users.list({ scope: scope.value, filters, pagination }));
  }
}
