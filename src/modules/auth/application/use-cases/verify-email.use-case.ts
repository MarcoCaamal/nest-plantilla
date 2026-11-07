import { Result, type Result as ResultType } from '@/shared/core/result';
import { UnitOfWorkPort } from '@/shared/application/ports/unit-of-work.port';
import { ClockPort } from '@/shared/application/ports/clock.port';
import { UserRepositoryPort } from '@/modules/users/public';
import { OpaqueTokenGeneratorPort } from '../ports/opaque-token-generator.port';
import { AccountTokenRepositoryPort } from '../ports/account-token-repository.port';
import type { AuthDomainError } from '../../domain/errors/auth-domain.error';

export class VerifyEmailUseCase {
  constructor(private readonly users: UserRepositoryPort, private readonly oneTime: AccountTokenRepositoryPort,
    private readonly opaque: OpaqueTokenGeneratorPort, private readonly clock: ClockPort,
    private readonly uow: UnitOfWorkPort) {}

  async execute(token: string): Promise<ResultType<void, AuthDomainError>> {
    return this.uow.runInTransaction(async () => {
      const userId = await this.oneTime.consume(this.opaque.digest(token), 'VERIFY_EMAIL', this.clock.now());
      if (!userId) return Result.err({ type: 'TOKEN_INVALID' });
      await this.users.verifyEmail(userId, this.clock.now());
      return Result.ok(undefined);
    });
  }
}
