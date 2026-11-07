import { Result, type Result as ResultType } from '@/shared/core/result';
import type { Principal } from '@/shared/domain/auth/principal';
import { IdGeneratorPort } from '@/shared/application/ports/id-generator.port';
import { UnitOfWorkPort } from '@/shared/application/ports/unit-of-work.port';
import type { UserError } from '../../../domain/errors/user.error';
import { UserResourcePolicy } from '../../../domain/policies/user-resource.policy';
import { UserRepositoryPort } from '../../ports/user-repository.port';

export class AssignUserRolesUseCase {
  constructor(private readonly users: UserRepositoryPort, private readonly policy: UserResourcePolicy,
    private readonly ids: IdGeneratorPort, private readonly uow: UnitOfWorkPort) {}

  async assign(actor: Principal, userId: string, roleKey: string): Promise<ResultType<void, UserError>> {
    if (!actor.permissions.includes('users:write')) return Result.err({ type: 'FORBIDDEN' });
    return this.uow.runInTransaction<void, UserError>(async () => {
      const user = await this.users.findById(userId);
      if (!user) return Result.err({ type: 'NOT_FOUND' });
      if (!this.policy.authorize(actor, 'write', user).ok) return Result.err({ type: 'FORBIDDEN' });
      const success = await this.users.assignRole(userId, roleKey, this.ids.generate());
      return success ? Result.ok(undefined) : Result.err({ type: 'NOT_FOUND' });
    });
  }

  async remove(actor: Principal, userId: string, roleKey: string): Promise<ResultType<void, UserError>> {
    if (!actor.permissions.includes('users:write')) return Result.err({ type: 'FORBIDDEN' });
    return this.uow.runInTransaction<void, UserError>(async () => {
      const user = await this.users.findById(userId);
      if (!user) return Result.err({ type: 'NOT_FOUND' });
      if (!this.policy.authorize(actor, 'write', user).ok) return Result.err({ type: 'FORBIDDEN' });
      const outcome = await this.users.removeRole(userId, roleKey);
      switch (outcome) {
        case 'REMOVED': return Result.ok(undefined);
        case 'LAST_ADMIN': return Result.err({ type: 'PROTECTED_USER' });
        case 'NOT_FOUND': return Result.err({ type: 'NOT_FOUND' });
      }
    });
  }
}
