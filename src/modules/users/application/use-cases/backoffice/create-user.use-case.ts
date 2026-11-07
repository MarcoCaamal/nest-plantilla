import { Result, type Result as ResultType } from '@/shared/core/result';
import type { Principal } from '@/shared/domain/auth/principal';
import { ClockPort } from '@/shared/application/ports/clock.port';
import { IdGeneratorPort } from '@/shared/application/ports/id-generator.port';
import { UnitOfWorkPort } from '@/shared/application/ports/unit-of-work.port';
import { PasswordHasherPort } from '@/modules/auth/public';
import type { SafeUser } from '../../../domain/entities/user.entity';
import type { UserError } from '../../../domain/errors/user.error';
import { UserRepositoryPort } from '../../ports/user-repository.port';

export class CreateUserUseCase {
  constructor(
    private readonly users: UserRepositoryPort, private readonly passwords: PasswordHasherPort,
    private readonly ids: IdGeneratorPort, private readonly clock: ClockPort, private readonly uow: UnitOfWorkPort,
  ) {}

  /** Admin-provisioned account; no StaffUser or separate login identity. */
  async execute(actor: Principal, input: { email: string; password: string; displayName?: string }): Promise<ResultType<SafeUser, UserError>> {
    if (!actor.permissions.includes('users:write')) return Result.err({ type: 'FORBIDDEN' });
    const email = input.email.trim().toLowerCase();
    if (await this.users.findByEmail(email)) return Result.err({ type: 'CONFLICT' });
    const passwordHash = await this.passwords.hash(input.password);
    return this.uow.runInTransaction<SafeUser, UserError>(async () => {
      const id = this.ids.generate();
      await this.users.create({
        id, email, passwordHash, displayName: input.displayName ?? null,
        status: 'ACTIVE', emailVerifiedAt: this.clock.now(),
      });
      const user = await this.users.findById(id);
      if (!user) return Result.err({ type: 'NOT_FOUND' });
      const { passwordHash: _secret, ...safe } = user;
      void _secret;
      return Result.ok(safe);
    });
  }
}
