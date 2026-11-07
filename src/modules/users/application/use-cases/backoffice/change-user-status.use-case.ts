import { Result, type Result as ResultType } from '@/shared/core/result';
import type { Principal } from '@/shared/domain/auth/principal';
import { ClockPort } from '@/shared/application/ports/clock.port';
import { UnitOfWorkPort } from '@/shared/application/ports/unit-of-work.port';
import { SessionRepositoryPort } from '@/modules/auth/public';
import type { UserError } from '../../../domain/errors/user.error';
import type { UserStatus, SafeUser } from '../../../domain/entities/user.entity';
import { UserRepositoryPort } from '../../ports/user-repository.port';
import { UserResourcePolicy } from '../../../domain/policies/user-resource.policy';

export class ChangeUserStatusUseCase {
  constructor(private readonly users: UserRepositoryPort, private readonly sessions: SessionRepositoryPort,
    private readonly policy: UserResourcePolicy, private readonly clock: ClockPort, private readonly uow: UnitOfWorkPort) {}

  async execute(actor: Principal, id: string, status: Extract<UserStatus, 'ACTIVE' | 'SUSPENDED'>): Promise<ResultType<SafeUser, UserError>> {
    if (!actor.permissions.includes('users:write')) return Result.err({ type: 'FORBIDDEN' });
    return this.uow.runInTransaction<SafeUser, UserError>(async () => {
      const user = await this.users.findById(id);
      if (!user) return Result.err({ type: 'NOT_FOUND' });
      if (!this.policy.authorize(actor, 'write', user).ok) return Result.err({ type: 'FORBIDDEN' });
      // Keep recovery access available; never suspend an administrator or self.
      if (status === 'SUSPENDED' && (user.roles.includes('admin') || user.id === actor.id)) {
        return Result.err({ type: 'PROTECTED_USER' });
      }
      await this.users.updateStatus(id, status);
      if (status === 'SUSPENDED') await this.sessions.revokeAll(id, this.clock.now());
      const updated = await this.users.findById(id);
      if (!updated) return Result.err({ type: 'NOT_FOUND' });
      const { passwordHash: _secret, ...safe } = updated;
      void _secret;
      return Result.ok(safe);
    });
  }
}
