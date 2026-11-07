import { Module } from '@nestjs/common';
import { AppConfig } from '@/shared/infrastructure/config/app-config';
import type { PresetEnv } from '@/shared/infrastructure/config/env.schema';
import { UserRepositoryPort, UsersModule } from '@/modules/users/public';
import { UnitOfWorkPort } from '@/shared/application/ports/unit-of-work.port';
import { ClockPort } from '@/shared/application/ports/clock.port';
import { IdGeneratorPort } from '@/shared/application/ports/id-generator.port';
import { TransactionalEventOutboxPort } from '@/shared/application/ports/transactional-event-outbox.port';
import { PasswordHasherPort } from './application/ports/password-hasher.port';
import { SessionRepositoryPort } from './application/ports/session-repository.port';
import { AccountTokenRepositoryPort } from './application/ports/account-token-repository.port';
import { OpaqueTokenGeneratorPort } from './application/ports/opaque-token-generator.port';
import { TokenIssuerPort } from './application/ports/token-issuer.port';
import { SessionTokenService } from './application/services/session-token.service';
import { RegisterUseCase } from './application/use-cases/register.use-case';
import { VerifyEmailUseCase } from './application/use-cases/verify-email.use-case';
import { LoginWithPasswordUseCase } from './application/use-cases/loginWithPassword.use-case';
import { RefreshSessionUseCase } from './application/use-cases/refresh-session.use-case';
import { RevokeSessionUseCase } from './application/use-cases/revoke-session.use-case';
import { RequestPasswordResetUseCase } from './application/use-cases/request-password-reset.use-case';
import { ResetPasswordUseCase } from './application/use-cases/reset-password.use-case';
import { AuthController } from './infrastructure/http/public/auth.controller';

@Module({
  imports: [UsersModule],
  controllers: [AuthController],
  providers: [
    {
      provide: SessionTokenService,
      useFactory: (ids: IdGeneratorPort, clock: ClockPort, opaque: OpaqueTokenGeneratorPort,
        issuer: TokenIssuerPort, config: AppConfig<PresetEnv>) =>
        new SessionTokenService(ids, clock, opaque, issuer, config.get('JWT_ACCESS_TTL_SECONDS'), config.get('REFRESH_TOKEN_TTL_DAYS')),
      inject: [IdGeneratorPort, ClockPort, OpaqueTokenGeneratorPort, TokenIssuerPort, AppConfig],
    },
    {
      provide: RegisterUseCase,
      useFactory: (users: UserRepositoryPort, passwords: PasswordHasherPort, ids: IdGeneratorPort,
        clock: ClockPort, opaque: OpaqueTokenGeneratorPort, oneTime: AccountTokenRepositoryPort,
        outbox: TransactionalEventOutboxPort, uow: UnitOfWorkPort) =>
        new RegisterUseCase(users, passwords, ids, clock, opaque, oneTime, outbox, uow),
      inject: [UserRepositoryPort, PasswordHasherPort, IdGeneratorPort, ClockPort, OpaqueTokenGeneratorPort, AccountTokenRepositoryPort, TransactionalEventOutboxPort, UnitOfWorkPort],
    },
    {
      provide: VerifyEmailUseCase,
      useFactory: (users: UserRepositoryPort, oneTime: AccountTokenRepositoryPort, opaque: OpaqueTokenGeneratorPort,
        clock: ClockPort, uow: UnitOfWorkPort) => new VerifyEmailUseCase(users, oneTime, opaque, clock, uow),
      inject: [UserRepositoryPort, AccountTokenRepositoryPort, OpaqueTokenGeneratorPort, ClockPort, UnitOfWorkPort],
    },
    {
      provide: LoginWithPasswordUseCase,
      useFactory: (users: UserRepositoryPort, passwords: PasswordHasherPort, ids: IdGeneratorPort,
        sessions: SessionRepositoryPort, tokens: SessionTokenService, uow: UnitOfWorkPort) =>
        new LoginWithPasswordUseCase(users, passwords, ids, sessions, tokens, uow),
      inject: [UserRepositoryPort, PasswordHasherPort, IdGeneratorPort, SessionRepositoryPort, SessionTokenService, UnitOfWorkPort],
    },
    {
      provide: RefreshSessionUseCase,
      useFactory: (users: UserRepositoryPort, sessions: SessionRepositoryPort, opaque: OpaqueTokenGeneratorPort,
        clock: ClockPort, tokens: SessionTokenService, uow: UnitOfWorkPort) =>
        new RefreshSessionUseCase(users, sessions, opaque, clock, tokens, uow),
      inject: [UserRepositoryPort, SessionRepositoryPort, OpaqueTokenGeneratorPort, ClockPort, SessionTokenService, UnitOfWorkPort],
    },
    {
      provide: RevokeSessionUseCase,
      useFactory: (sessions: SessionRepositoryPort, clock: ClockPort) => new RevokeSessionUseCase(sessions, clock),
      inject: [SessionRepositoryPort, ClockPort],
    },
    {
      provide: RequestPasswordResetUseCase,
      useFactory: (users: UserRepositoryPort, oneTime: AccountTokenRepositoryPort, opaque: OpaqueTokenGeneratorPort,
        ids: IdGeneratorPort, clock: ClockPort, outbox: TransactionalEventOutboxPort, uow: UnitOfWorkPort) =>
        new RequestPasswordResetUseCase(users, oneTime, opaque, ids, clock, outbox, uow),
      inject: [UserRepositoryPort, AccountTokenRepositoryPort, OpaqueTokenGeneratorPort, IdGeneratorPort, ClockPort, TransactionalEventOutboxPort, UnitOfWorkPort],
    },
    {
      provide: ResetPasswordUseCase,
      useFactory: (users: UserRepositoryPort, oneTime: AccountTokenRepositoryPort, opaque: OpaqueTokenGeneratorPort,
        passwords: PasswordHasherPort, sessions: SessionRepositoryPort, clock: ClockPort, uow: UnitOfWorkPort) =>
        new ResetPasswordUseCase(users, oneTime, opaque, passwords, sessions, clock, uow),
      inject: [UserRepositoryPort, AccountTokenRepositoryPort, OpaqueTokenGeneratorPort, PasswordHasherPort, SessionRepositoryPort, ClockPort, UnitOfWorkPort],
    },
  ],
})
export class AuthPresetModule {}
