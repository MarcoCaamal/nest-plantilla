import { Result, type Result as ResultType } from '@/shared/core/result';
import { UnitOfWorkPort } from '@/shared/application/ports/unit-of-work.port';
import { IdGeneratorPort } from '@/shared/application/ports/id-generator.port';
import { UserRepositoryPort } from '@/modules/users/public';
import type { AuthDomainError } from '../../domain/errors/auth-domain.error';
import { PasswordHasherPort } from '../ports/password-hasher.port';
import { SessionRepositoryPort } from '../ports/session-repository.port';
import { SessionTokenService } from '../services/session-token.service';
import type { AuthTokens, DeviceContext } from '../types';

export class LoginWithPasswordUseCase {
  constructor(private readonly users: UserRepositoryPort, private readonly passwords: PasswordHasherPort,
    private readonly ids: IdGeneratorPort, private readonly sessions: SessionRepositoryPort,
    private readonly tokenService: SessionTokenService, private readonly uow: UnitOfWorkPort) {}

  async execute(input: { email: string; password: string }, device: DeviceContext = {}): Promise<ResultType<AuthTokens, AuthDomainError>> {
    const user = await this.users.findByEmail(input.email.trim().toLowerCase());
    if (!user || !await this.passwords.verify(user.passwordHash, input.password)) {
      return Result.err({ type: 'INVALID_CREDENTIALS' });
    }
    if (user.status !== 'ACTIVE') return Result.err({ type: 'IDENTITY_INACTIVE' });
    const session = this.tokenService.nextSession(user.id, this.ids.generate(), device);
    return this.uow.runInTransaction(async () => {
      await this.sessions.create(session.record);
      return Result.ok(await this.tokenService.tokens(user.id, session.record.id, session.raw));
    });
  }
}
