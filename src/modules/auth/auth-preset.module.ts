import { Module } from '@nestjs/common';
import { AppConfig } from '@/shared/infrastructure/config/app-config';
import type { PresetEnv } from '@/shared/infrastructure/config/env.schema';
import { UserRepositoryPort } from '@/modules/users/public';
import { UsersModule } from '@/modules/users/public';
import { UnitOfWorkPort } from '@/shared/application/ports/unit-of-work.port';
import { ClockPort } from '@/shared/application/ports/clock.port';
import { IdGeneratorPort } from '@/shared/application/ports/id-generator.port';
import { PasswordHasherPort } from '@/shared/application/ports/password-hasher.port';
import { TransactionalEventOutboxPort } from '@/shared/application/ports/transactional-event-outbox.port';
import { AuthFlows } from './application/auth-flows';
import { AuthSessionRepositoryPort } from './application/ports/auth-session-repository.port';
import { AccountTokenRepositoryPort } from './application/ports/account-token-repository.port';
import { OpaqueTokenGeneratorPort } from './application/ports/opaque-token-generator.port';
import { AccessTokenIssuerPort } from './application/ports/access-token-issuer.port';
import { AuthController } from './infrastructure/http/client/auth.controller';

@Module({
  imports: [UsersModule],
  controllers: [AuthController],
  providers: [
    {
      provide: AuthFlows,
      useFactory: (
        users: UserRepositoryPort, sessions: AuthSessionRepositoryPort,
        passwords: PasswordHasherPort, ids: IdGeneratorPort, clock: ClockPort,
        opaque: OpaqueTokenGeneratorPort, issuer: AccessTokenIssuerPort,
        uow: UnitOfWorkPort, outbox: TransactionalEventOutboxPort,
        oneTime: AccountTokenRepositoryPort, config: AppConfig<PresetEnv>,
      ) => new AuthFlows(
        users, sessions, passwords, ids, clock, opaque, issuer, uow, outbox, oneTime,
        config.get('JWT_ACCESS_TTL_SECONDS'), config.get('REFRESH_TOKEN_TTL_DAYS'),
      ),
      inject: [
        UserRepositoryPort, AuthSessionRepositoryPort, PasswordHasherPort, IdGeneratorPort,
        ClockPort, OpaqueTokenGeneratorPort, AccessTokenIssuerPort, UnitOfWorkPort,
        TransactionalEventOutboxPort, AccountTokenRepositoryPort, AppConfig,
      ],
    },
  ],
  exports: [AuthFlows],
})
export class AuthPresetModule {}
