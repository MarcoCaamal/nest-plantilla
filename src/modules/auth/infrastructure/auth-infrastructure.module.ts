import { Global, Module } from '@nestjs/common';
import { AuthSessionRepositoryPort } from '../application/ports/auth-session-repository.port';
import { AccountTokenRepositoryPort } from '../application/ports/account-token-repository.port';
import { OpaqueTokenGeneratorPort } from '../application/ports/opaque-token-generator.port';
import { AccessTokenIssuerPort } from '../application/ports/access-token-issuer.port';
import { PrismaSessionRepository } from './adapters/prisma-session.repository';
import { PrismaAccountTokenRepository } from './adapters/prisma-account-token.repository';
import { SecureOpaqueTokenAdapter } from './adapters/opaque-token.adapter';
import { JwtAccessTokenAdapter } from './adapters/jwt-access-token.adapter';

@Global()
@Module({
  providers: [
    PrismaSessionRepository, PrismaAccountTokenRepository, JwtAccessTokenAdapter,
    { provide: AuthSessionRepositoryPort, useExisting: PrismaSessionRepository },
    { provide: AccountTokenRepositoryPort, useExisting: PrismaAccountTokenRepository },
    { provide: OpaqueTokenGeneratorPort, useClass: SecureOpaqueTokenAdapter },
    { provide: AccessTokenIssuerPort, useExisting: JwtAccessTokenAdapter },
  ],
  exports: [AuthSessionRepositoryPort, AccountTokenRepositoryPort, OpaqueTokenGeneratorPort, AccessTokenIssuerPort],
})
export class AuthInfrastructureModule {}
