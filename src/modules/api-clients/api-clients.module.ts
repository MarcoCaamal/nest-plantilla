import { Module, type DynamicModule, type ModuleMetadata, type Provider } from '@nestjs/common';
import { ApiKeyVerifierPort } from './application/ports/api-key-verifier.port';
import { AuthenticateApiClientUseCase } from './application/use-cases/authenticate-api-client.use-case';
import { ApiKeyAuthenticationGuard } from './infrastructure/http/guards/api-key-authentication.guard';

/** Application-client IAM is independent of human authentication. */
@Module({})
export class ApiClientsModule {
  static register(options: {
    readonly verifier: Provider<ApiKeyVerifierPort>;
    readonly imports?: ModuleMetadata['imports'];
  }): DynamicModule {
    return {
      module: ApiClientsModule,
      imports: options.imports ?? [],
      providers: [
        options.verifier,
        {
          provide: AuthenticateApiClientUseCase,
          useFactory: (verifier: ApiKeyVerifierPort) => new AuthenticateApiClientUseCase(verifier),
          inject: [ApiKeyVerifierPort],
        },
        ApiKeyAuthenticationGuard,
      ],
      exports: [AuthenticateApiClientUseCase, ApiKeyAuthenticationGuard],
    };
  }
}
