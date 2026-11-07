import { Global, Module } from '@nestjs/common';
import { AuthModule } from './auth.module';
import { UserCredentialVerifierPort } from './application/ports/user-credential-verifier.port';
import { AuthInfrastructureModule } from './infrastructure/auth-infrastructure.module';
import { JwtUserCredentialVerifierAdapter } from './infrastructure/adapters/jwt-user-credential-verifier.adapter';

@Global()
@Module({
  imports: [
    AuthInfrastructureModule,
    AuthModule.register({
      verifier: { provide: UserCredentialVerifierPort, useClass: JwtUserCredentialVerifierAdapter },
    }),
  ],
  exports: [AuthModule],
})
export class JwtAuthnModule {}
