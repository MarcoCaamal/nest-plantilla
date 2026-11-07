import { Result, type Result as ResultType } from '@/shared/core/result';
import type { UserPrincipal } from '@/shared/domain/auth/principal';
import { UnitOfWorkPort } from '@/shared/application/ports/unit-of-work.port';
import type { SafeUser } from '../../../domain/entities/user.entity';
import type { UserError } from '../../../domain/errors/user.error';
import { UserRepositoryPort } from '../../ports/user-repository.port';

export class UpdateMyProfileUseCase {
  constructor(private readonly users: UserRepositoryPort, private readonly uow: UnitOfWorkPort) {}

  /** Only a public display name may change here; email uses account verification. */
  async execute(actor: UserPrincipal, displayName: string | null): Promise<ResultType<SafeUser, UserError>> {
    return this.uow.runInTransaction<SafeUser, UserError>(async () => {
      const user = await this.users.findById(actor.id);
      if (!user || user.status !== 'ACTIVE') return Result.err({ type: 'NOT_FOUND' });
      await this.users.updateProfile(actor.id, displayName);
      const updated = await this.users.findById(actor.id);
      if (!updated) return Result.err({ type: 'NOT_FOUND' });
      const { passwordHash: _secret, ...safe } = updated;
      void _secret;
      return Result.ok(safe);
    });
  }
}
