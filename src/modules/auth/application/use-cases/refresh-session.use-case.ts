import { Result, type Result as ResultType } from '@/shared/core/result';
import { UnitOfWorkPort } from '@/shared/application/ports/unit-of-work.port';
import { ClockPort } from '@/shared/application/ports/clock.port';
import { UserRepositoryPort } from '@/modules/users/public';
import type { AuthDomainError } from '../../domain/errors/auth-domain.error';
import { OpaqueTokenGeneratorPort } from '../ports/opaque-token-generator.port';
import { SessionRepositoryPort } from '../ports/session-repository.port';
import { SessionTokenService } from '../services/session-token.service';
import type { AuthTokens, DeviceContext } from '../types';

export class RefreshSessionUseCase {
  constructor(private readonly users: UserRepositoryPort, private readonly sessions: SessionRepositoryPort,
    private readonly opaque: OpaqueTokenGeneratorPort, private readonly clock: ClockPort,
    private readonly tokenService: SessionTokenService, private readonly uow: UnitOfWorkPort) {}

  async execute(refreshToken: string, device: DeviceContext = {}): Promise<ResultType<AuthTokens, AuthDomainError>> {
    // Replay must COMMIT family revocation: return an OK transaction outcome
    // then map the outcome to Result.err outside the unit of work.
    type Outcome =
      | { readonly kind: 'INVALID' }
      | { readonly kind: 'REUSED' }
      | { readonly kind: 'OK'; readonly tokens: AuthTokens };
    const outcome = await this.uow.runInTransaction<Outcome, never>(async () => {
      const old = await this.sessions.findByTokenHash(this.opaque.digest(refreshToken));
      if (!old) return Result.ok({ kind: 'INVALID' as const });
      const now = this.clock.now();
      if (old.revokedAt !== null && old.replacedBySessionId !== null) {
        await this.sessions.revokeFamily(old.familyId, now);
        return Result.ok({ kind: 'REUSED' as const });
      }
      if (old.revokedAt !== null || old.expiresAt <= now) return Result.ok({ kind: 'INVALID' as const });
      const user = await this.users.findById(old.userId);
      if (!user || user.status !== 'ACTIVE') return Result.ok({ kind: 'INVALID' as const });
      const next = this.tokenService.nextSession(old.userId, old.familyId, device);
      const rotation = await this.sessions.rotate(old, next.record, now);
      if (rotation === 'REUSED') return Result.ok({ kind: 'REUSED' as const });
      return Result.ok({ kind: 'OK' as const, tokens: await this.tokenService.tokens(old.userId, next.record.id, next.raw) });
    });
    if (!outcome.ok) return outcome;
    if (outcome.value.kind === 'INVALID') return Result.err({ type: 'REFRESH_INVALID' });
    if (outcome.value.kind === 'REUSED') return Result.err({ type: 'REFRESH_REUSED' });
    return Result.ok(outcome.value.tokens);
  }
}
