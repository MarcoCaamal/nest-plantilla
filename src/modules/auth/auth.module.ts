import { Module, type DynamicModule, type ModuleMetadata, type Provider } from '@nestjs/common';
import { HumanCredentialVerifierPort } from './application/ports/human-credential-verifier.port';
import { AuthenticateHumanUseCase } from './application/use-cases/authenticate-human.use-case';
import { HumanAuthenticationGuard } from './infrastructure/http/guards/human-authentication.guard';

/**
 * This module has no default verifier. Register an explicit adapter in each
 * project: AuthModule.register({ verifier: { provide: HumanCredentialVerifierPort, useClass: MyVerifier } }).
 * Do NOT import this module into AppModule without a real verifier.
 */
@Module({})
export class AuthModule {
  static register(options: {
    readonly verifier: Provider<HumanCredentialVerifierPort>;
    readonly imports?: ModuleMetadata['imports'];
  }): DynamicModule {
    return {
      module: AuthModule,
      imports: options.imports ?? [],
      providers: [
        options.verifier,
        {
          provide: AuthenticateHumanUseCase,
          useFactory: (verifier: HumanCredentialVerifierPort) => new AuthenticateHumanUseCase(verifier),
          inject: [HumanCredentialVerifierPort],
        },
        HumanAuthenticationGuard,
      ],
      exports: [AuthenticateHumanUseCase, HumanAuthenticationGuard],
    };
  }
}
