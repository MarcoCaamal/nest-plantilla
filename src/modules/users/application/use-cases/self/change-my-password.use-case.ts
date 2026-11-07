import { Result, type Result as ResultType } from '@/shared/core/result';
import type { UserPrincipal } from '@/shared/domain/auth/principal';
import { UnitOfWorkPort } from '@/shared/application/ports/unit-of-work.port';
import { ClockPort } from '@/shared/application/ports/clock.port';
import { PasswordHasherPort, SessionRepositoryPort } from '@/modules/auth/public';
import type { UserError } from '../../../domain/errors/user.error';
import { UserRepositoryPort } from '../../ports/user-repository.port';

export class ChangeMyPasswordUseCase {
  constructor(
    private readonly users: UserRepositoryPort,
    private readonly passwords: PasswordHasherPort,
    private readonly sessions: SessionRepositoryPort,
    private readonly clock: ClockPort,
    private readonly uow: UnitOfWorkPort,
  ) {}

  async execute(actor: UserPrincipal, current: string, next: string): Promise<ResultType<void, UserError>> {
    const user = await this.users.findById(actor.id);
    if (!user || user.status !== 'ACTIVE') return Result.err({ type: 'NOT_FOUND' });
    if (!await this.passwords.verify(user.passwordHash, current)) return Result.err({ type: 'INVALID_PASSWORD' });
    const nextHash = await this.passwords.hash(next);
    return this.uow.runInTransaction<void, UserError>(async () => {
      await this.users.updatePassword(user.id, nextHash);
      await this.sessions.revokeAll(user.id, this.clock.now());
      return Result.ok(undefined);
    });
  }
}
