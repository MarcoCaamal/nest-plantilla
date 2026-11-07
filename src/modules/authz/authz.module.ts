import { Global, Module } from '@nestjs/common';
import { GateGuard } from '@/shared/infrastructure/http/guards/gate.guard';
import { AuthorizeActionUseCase } from './application/authorize-action.use-case';
import { AuthorizeResourceUseCase } from './application/authorize-resource.use-case';
import { ResolveAccessScopeUseCase } from './application/resolve-access-scope.use-case';

/**
 * Only authorization infrastructure. Actual authentication is configured by
 * each audience and must run BEFORE GateGuard on protected endpoints.
 */
@Global()
@Module({
  providers: [
    GateGuard,
    { provide: AuthorizeActionUseCase, useFactory: () => new AuthorizeActionUseCase() },
    { provide: AuthorizeResourceUseCase, useFactory: () => new AuthorizeResourceUseCase() },
    { provide: ResolveAccessScopeUseCase, useFactory: () => new ResolveAccessScopeUseCase() },
  ],
  exports: [GateGuard, AuthorizeActionUseCase, AuthorizeResourceUseCase, ResolveAccessScopeUseCase],
})
export class AuthzModule {}
