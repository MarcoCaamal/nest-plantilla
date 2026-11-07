import { Result, type Result as ResultType } from '@/shared/core/result';
import { UnitOfWorkPort } from '@/shared/application/ports/unit-of-work.port';
import { ClockPort } from '@/shared/application/ports/clock.port';
import { IdGeneratorPort } from '@/shared/application/ports/id-generator.port';
import { TransactionalEventOutboxPort } from '@/shared/application/ports/transactional-event-outbox.port';
import { UserRepositoryPort } from '@/modules/users/public';
import { PasswordHasherPort } from '../ports/password-hasher.port';
import { OpaqueTokenGeneratorPort } from '../ports/opaque-token-generator.port';
import { AccountTokenRepositoryPort } from '../ports/account-token-repository.port';
import type { AuthDomainError } from '../../domain/errors/auth-domain.error';

export class RegisterUseCase {
  constructor(private readonly users: UserRepositoryPort, private readonly passwords: PasswordHasherPort,
    private readonly ids: IdGeneratorPort, private readonly clock: ClockPort,
    private readonly opaque: OpaqueTokenGeneratorPort, private readonly oneTime: AccountTokenRepositoryPort,
    private readonly outbox: TransactionalEventOutboxPort, private readonly uow: UnitOfWorkPort) {}

  async execute(input: { email: string; password: string }): Promise<ResultType<{ id: string; status: string }, AuthDomainError>> {
    const email = input.email.trim().toLowerCase();
    if (await this.users.findByEmail(email)) return Result.err({ type: 'EMAIL_TAKEN' });
    const id = this.ids.generate();
    const passwordHash = await this.passwords.hash(input.password);
    return this.uow.runInTransaction(async () => {
      await this.users.create({ id, email, passwordHash, status: 'PENDING_VERIFICATION', emailVerifiedAt: null });
      const token = this.opaque.generate();
      await this.oneTime.issue({ id: this.ids.generate(), userId: id, purpose: 'VERIFY_EMAIL',
        tokenHash: this.opaque.digest(token), expiresAt: new Date(this.clock.now().getTime() + 86400000) });
      const event = {
        eventName: 'account.verify_email_requested', aggregateId: id,
        occurredAt: this.clock.now().toISOString(), email, token,
      };
      await this.outbox.append([event]);
      return Result.ok({ id, status: 'PENDING_VERIFICATION' });
    });
  }
}
