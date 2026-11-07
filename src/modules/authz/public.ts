/** The only supported import surface for other feature modules. */
export { AuthzModule } from './authz.module';
export { AuthorizeActionUseCase, type AuthorizeActionInput } from './application/authorize-action.use-case';
export { AuthorizeResourceUseCase, type AuthorizeResourceInput } from './application/authorize-resource.use-case';
export { ResolveAccessScopeUseCase, type ResolveAccessScopeInput } from './application/resolve-access-scope.use-case';
export { AuthzErrorMapper } from './infrastructure/http/authz-error.mapper';
