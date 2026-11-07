import { Result, type Result as ResultType } from '@/shared/core/result';
import { UnitOfWorkPort } from '@/shared/application/ports/unit-of-work.port';
import { ClockPort } from '@/shared/application/ports/clock.port';
import { IdGeneratorPort } from '@/shared/application/ports/id-generator.port';
import { PasswordHasherPort } from '@/shared/application/ports/password-hasher.port';
import { TransactionalEventOutboxPort } from '@/shared/application/ports/transactional-event-outbox.port';
import { UserRepositoryPort } from '@/modules/users/public';
import { AuthSessionRepositoryPort, type NewSession } from './ports/auth-session-repository.port';
import { AccountTokenRepositoryPort } from './ports/account-token-repository.port';
import { AccessTokenIssuerPort } from './ports/access-token-issuer.port';
import { OpaqueTokenGeneratorPort } from './ports/opaque-token-generator.port';

export type AuthFlowError =
  | { readonly type: 'INVALID_CREDENTIALS' }
  | { readonly type: 'IDENTITY_INACTIVE' }
  | { readonly type: 'EMAIL_TAKEN' }
  | { readonly type: 'REFRESH_INVALID' }
  | { readonly type: 'REFRESH_REUSED' }
  | { readonly type: 'TOKEN_INVALID' };

export interface AuthTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly tokenType: 'Bearer';
  readonly expiresIn: number;
}

export interface DeviceContext { readonly userAgent?: string; readonly ipAddress?: string; }

/** Shared I/O coordination for registration, login, refresh and session revocation. */
export class AuthFlows {
  constructor(
    private readonly users: UserRepositoryPort,
    private readonly sessions: AuthSessionRepositoryPort,
    private readonly passwords: PasswordHasherPort,
    private readonly ids: IdGeneratorPort,
    private readonly clock: ClockPort,
    private readonly opaque: OpaqueTokenGeneratorPort,
    private readonly accessTokens: AccessTokenIssuerPort,
    private readonly uow: UnitOfWorkPort,
    private readonly outbox: TransactionalEventOutboxPort,
    private readonly oneTime: AccountTokenRepositoryPort,
    private readonly accessTtlSeconds: number,
    private readonly refreshTtlDays: number,
  ) {}

  async register(input: { email: string; password: string }): Promise<ResultType<{ id: string; status: string }, AuthFlowError>> {
    const email = input.email.trim().toLowerCase();
    if (await this.users.findByEmail(email)) return Result.err({ type: 'EMAIL_TAKEN' });
    const id = this.ids.generate();
    const passwordHash = await this.passwords.hash(input.password);
    return this.uow.runInTransaction(async () => {
      // DB uniqueness remains authoritative when two registrations race.
      await this.users.create({ id, email, passwordHash, status: 'PENDING_VERIFICATION', emailVerifiedAt: null });
      const token = this.opaque.generate();
      await this.oneTime.issue({
        id: this.ids.generate(), userId: id, purpose: 'VERIFY_EMAIL',
        tokenHash: this.opaque.digest(token),
        expiresAt: new Date(this.clock.now().getTime() + 86400000),
      });
      const event = {
        eventName: 'account.verify_email_requested', aggregateId: id,
        occurredAt: this.clock.now().toISOString(), email, token,
      };
      await this.outbox.append([event]);
      return Result.ok({ id, status: 'PENDING_VERIFICATION' });
    });
  }

  async login(input: { email: string; password: string }, device: DeviceContext = {}): Promise<ResultType<AuthTokens, AuthFlowError>> {
    const user = await this.users.findByEmail(input.email.trim().toLowerCase());
    // A dummy hash would make timing more uniform for unknown accounts; avoid
    // reflecting presence in error responses (same public error for all).
    if (!user || !(await this.passwords.verify(user.passwordHash, input.password))) {
      return Result.err({ type: 'INVALID_CREDENTIALS' });
    }
    if (user.status !== 'ACTIVE') return Result.err({ type: 'IDENTITY_INACTIVE' });
    const session = this.nextSession(user.id, this.ids.generate(), device);
    return this.uow.runInTransaction(async () => {
      await this.sessions.create(session.record);
      return Result.ok(await this.tokens(user.id, session.record.id, session.raw));
    });
  }

  async refresh(refreshToken: string, device: DeviceContext = {}): Promise<ResultType<AuthTokens, AuthFlowError>> {
    // Refresh replay must commit family revocation. Returning Result.err from
    // inside UoW would ROLLBACK it, so the transaction returns an outcome.
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
      const next = this.nextSession(old.userId, old.familyId, device);
      const rotation = await this.sessions.rotate(old, next.record, now);
      if (rotation === 'REUSED') return Result.ok({ kind: 'REUSED' as const });
      return Result.ok({ kind: 'OK' as const, tokens: await this.tokens(old.userId, next.record.id, next.raw) });
    });
    if (!outcome.ok) return outcome;
    if (outcome.value.kind === 'INVALID') return Result.err({ type: 'REFRESH_INVALID' });
    if (outcome.value.kind === 'REUSED') return Result.err({ type: 'REFRESH_REUSED' });
    return Result.ok(outcome.value.tokens);
  }

  async verifyEmail(token: string): Promise<ResultType<void, AuthFlowError>> {
    return this.uow.runInTransaction(async () => {
      const userId = await this.oneTime.consume(this.opaque.digest(token), 'VERIFY_EMAIL', this.clock.now());
      if (!userId) return Result.err({ type: 'TOKEN_INVALID' });
      await this.users.verifyEmail(userId, this.clock.now());
      return Result.ok(undefined);
    });
  }

  async forgotPassword(email: string): Promise<ResultType<void, never>> {
    const user = await this.users.findByEmail(email.trim().toLowerCase());
    if (!user || user.status !== 'ACTIVE') return Result.ok(undefined);
    return this.uow.runInTransaction(async () => {
      const token = this.opaque.generate();
      await this.oneTime.issue({
        id: this.ids.generate(), userId: user.id, purpose: 'RESET_PASSWORD',
        tokenHash: this.opaque.digest(token),
        expiresAt: new Date(this.clock.now().getTime() + 3600000),
      });
      const event = {
        eventName: 'account.password_reset_requested', aggregateId: user.id,
        occurredAt: this.clock.now().toISOString(), email: user.email, token,
      };
      await this.outbox.append([event]);
      return Result.ok(undefined);
    });
  }

  async resetPassword(token: string, plain: string): Promise<ResultType<void, AuthFlowError>> {
    const passwordHash = await this.passwords.hash(plain);
    return this.uow.runInTransaction(async () => {
      const userId = await this.oneTime.consume(this.opaque.digest(token), 'RESET_PASSWORD', this.clock.now());
      if (!userId) return Result.err({ type: 'TOKEN_INVALID' });
      await this.users.updatePassword(userId, passwordHash);
      await this.sessions.revokeAll(userId, this.clock.now());
      return Result.ok(undefined);
    });
  }

  async logout(userId: string, sessionId: string): Promise<ResultType<void, never>> {
    await this.sessions.revokeById(sessionId, userId, this.clock.now());
    return Result.ok(undefined);
  }

  async logoutAll(userId: string): Promise<ResultType<void, never>> {
    await this.sessions.revokeAll(userId, this.clock.now());
    return Result.ok(undefined);
  }

  private nextSession(userId: string, familyId: string, device: DeviceContext): { raw: string; record: NewSession } {
    const raw = this.opaque.generate();
    const record: NewSession = {
      id: this.ids.generate(),
      userId,
      familyId,
      tokenHash: this.opaque.digest(raw),
      expiresAt: new Date(this.clock.now().getTime() + this.refreshTtlDays * 86400000),
      ...(device.userAgent ? { userAgent: device.userAgent.slice(0, 512) } : {}),
      ...(device.ipAddress ? { ipAddress: device.ipAddress.slice(0, 128) } : {}),
    };
    return { raw, record };
  }

  private async tokens(userId: string, sessionId: string, raw: string): Promise<AuthTokens> {
    return {
      accessToken: await this.accessTokens.issue({ userId, sessionId }),
      refreshToken: raw,
      tokenType: 'Bearer',
      expiresIn: this.accessTtlSeconds,
    };
  }
}
