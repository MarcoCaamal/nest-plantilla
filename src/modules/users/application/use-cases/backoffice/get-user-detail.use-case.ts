import { Result, type Result as ResultType } from '@/shared/core/result';
import type { Principal } from '@/shared/domain/auth/principal';
import type { SafeUser } from '../../../domain/entities/user.entity';
import type { UserError } from '../../../domain/errors/user.error';
import { UserRepositoryPort } from '../../ports/user-repository.port';
import { UserResourcePolicy } from '../../../domain/policies/user-resource.policy';

export class GetUserDetailUseCase {
  constructor(private readonly users: UserRepositoryPort, private readonly policy: UserResourcePolicy) {}

  async execute(actor: Principal, id: string): Promise<ResultType<SafeUser, UserError>> {
    if (!actor.permissions.includes('users:read')) return Result.err({ type: 'FORBIDDEN' });
    const user = await this.users.findById(id);
    if (!user) return Result.err({ type: 'NOT_FOUND' });
    if (!this.policy.authorize(actor, 'read', user).ok) return Result.err({ type: 'FORBIDDEN' });
    const { passwordHash: _secret, ...safe } = user;
    void _secret;
    return Result.ok(safe);
  }
}
