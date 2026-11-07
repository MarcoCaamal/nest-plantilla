import { Global, Module } from '@nestjs/common';
import { PasswordHasherPort } from '../application/ports/password-hasher.port';
import { Argon2PasswordHasherAdapter } from './security/argon2-password-hasher.adapter';
import { SessionRepositoryPort } from '../application/ports/session-repository.port';
import { AccountTokenRepositoryPort } from '../application/ports/account-token-repository.port';
import { OpaqueTokenGeneratorPort } from '../application/ports/opaque-token-generator.port';
import { TokenIssuerPort } from '../application/ports/token-issuer.port';
import { PrismaSessionRepository } from './persistence/prisma-session.repository';
import { PrismaAccountTokenRepository } from './persistence/prisma-account-token.repository';
import { SecureOpaqueTokenAdapter } from './security/opaque-token.adapter';
import { JwtTokenAdapter } from './security/jwt-token.adapter';

@Global()
@Module({
  providers: [
    PrismaSessionRepository, PrismaAccountTokenRepository, JwtTokenAdapter,
    { provide: PasswordHasherPort, useClass: Argon2PasswordHasherAdapter },
    { provide: SessionRepositoryPort, useExisting: PrismaSessionRepository },
    { provide: AccountTokenRepositoryPort, useExisting: PrismaAccountTokenRepository },
    { provide: OpaqueTokenGeneratorPort, useClass: SecureOpaqueTokenAdapter },
    { provide: TokenIssuerPort, useExisting: JwtTokenAdapter },
  ],
  exports: [SessionRepositoryPort, AccountTokenRepositoryPort, OpaqueTokenGeneratorPort, TokenIssuerPort, PasswordHasherPort],
})
export class AuthInfrastructureModule {}
