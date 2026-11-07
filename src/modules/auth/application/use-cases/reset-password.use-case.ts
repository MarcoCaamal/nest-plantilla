import { Result, type Result as ResultType } from '@/shared/core/result';
import { UnitOfWorkPort } from '@/shared/application/ports/unit-of-work.port';
import { ClockPort } from '@/shared/application/ports/clock.port';
import { UserRepositoryPort } from '@/modules/users/public';
import type { AuthDomainError } from '../../domain/errors/auth-domain.error';
import { PasswordHasherPort } from '../ports/password-hasher.port';
import { SessionRepositoryPort } from '../ports/session-repository.port';
import { OpaqueTokenGeneratorPort } from '../ports/opaque-token-generator.port';
import { AccountTokenRepositoryPort } from '../ports/account-token-repository.port';

export class ResetPasswordUseCase {
  constructor(private readonly users: UserRepositoryPort, private readonly oneTime: AccountTokenRepositoryPort,
    private readonly opaque: OpaqueTokenGeneratorPort, private readonly passwords: PasswordHasherPort,
    private readonly sessions: SessionRepositoryPort, private readonly clock: ClockPort,
    private readonly uow: UnitOfWorkPort) {}

  async execute(token: string, plain: string): Promise<ResultType<void, AuthDomainError>> {
    const passwordHash = await this.passwords.hash(plain);
    return this.uow.runInTransaction(async () => {
      const userId = await this.oneTime.consume(this.opaque.digest(token), 'RESET_PASSWORD', this.clock.now());
      if (!userId) return Result.err({ type: 'TOKEN_INVALID' });
      await this.users.updatePassword(userId, passwordHash);
      await this.sessions.revokeAll(userId, this.clock.now());
      return Result.ok(undefined);
    });
  }
}
