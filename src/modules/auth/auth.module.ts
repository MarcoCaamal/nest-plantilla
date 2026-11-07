import { Module, type DynamicModule, type ModuleMetadata, type Provider } from '@nestjs/common';
import { UserCredentialVerifierPort } from './application/ports/user-credential-verifier.port';
import { AuthenticateUserUseCase } from './application/use-cases/authenticate-user.use-case';
import { UserAuthenticationGuard } from './infrastructure/http/guards/user-authentication.guard';

/**
 * This module has no default verifier. Register an explicit adapter in each
 * project: AuthModule.register({ verifier: { provide: UserCredentialVerifierPort, useClass: MyVerifier } }).
 * Do NOT import this module into AppModule without a real verifier.
 */
@Module({})
export class AuthModule {
  static register(options: {
    readonly verifier: Provider<UserCredentialVerifierPort>;
    readonly imports?: ModuleMetadata['imports'];
  }): DynamicModule {
    return {
      module: AuthModule,
      imports: options.imports ?? [],
      providers: [
        options.verifier,
        {
          provide: AuthenticateUserUseCase,
          useFactory: (verifier: UserCredentialVerifierPort) => new AuthenticateUserUseCase(verifier),
          inject: [UserCredentialVerifierPort],
        },
        UserAuthenticationGuard,
      ],
      exports: [AuthenticateUserUseCase, UserAuthenticationGuard],
    };
  }
}
