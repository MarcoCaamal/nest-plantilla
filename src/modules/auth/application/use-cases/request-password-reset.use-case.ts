import { Result, type Result as ResultType } from '@/shared/core/result';
import { UnitOfWorkPort } from '@/shared/application/ports/unit-of-work.port';
import { ClockPort } from '@/shared/application/ports/clock.port';
import { IdGeneratorPort } from '@/shared/application/ports/id-generator.port';
import { TransactionalEventOutboxPort } from '@/shared/application/ports/transactional-event-outbox.port';
import { UserRepositoryPort } from '@/modules/users/public';
import { OpaqueTokenGeneratorPort } from '../ports/opaque-token-generator.port';
import { AccountTokenRepositoryPort } from '../ports/account-token-repository.port';

export class RequestPasswordResetUseCase {
  constructor(private readonly users: UserRepositoryPort, private readonly oneTime: AccountTokenRepositoryPort,
    private readonly opaque: OpaqueTokenGeneratorPort, private readonly ids: IdGeneratorPort,
    private readonly clock: ClockPort, private readonly outbox: TransactionalEventOutboxPort,
    private readonly uow: UnitOfWorkPort) {}

  async execute(email: string): Promise<ResultType<void, never>> {
    const user = await this.users.findByEmail(email.trim().toLowerCase());
    if (!user || user.status !== 'ACTIVE') return Result.ok(undefined);
    return this.uow.runInTransaction(async () => {
      const token = this.opaque.generate();
      await this.oneTime.issue({ id: this.ids.generate(), userId: user.id, purpose: 'RESET_PASSWORD',
        tokenHash: this.opaque.digest(token), expiresAt: new Date(this.clock.now().getTime() + 3600000) });
      const event = {
        eventName: 'account.password_reset_requested', aggregateId: user.id,
        occurredAt: this.clock.now().toISOString(), email: user.email, token,
      };
      await this.outbox.append([event]);
      return Result.ok(undefined);
    });
  }
}
