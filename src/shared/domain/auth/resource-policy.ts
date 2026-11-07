import type { Result } from '@/shared/core/result';
import type { AccessScope } from './access-scope';
import type { AuthorizationError } from './authorization-error';
import type { Principal } from './principal';

/** Pure synchronous policy. The domain never reads the database. */
export abstract class ResourcePolicy<
  TEntity,
  TAction extends string,
  TConstraints,
  TAttributes extends object = Record<string, unknown>,
> {
  abstract authorize(
    actor: Principal<TAttributes>,
    action: TAction,
    entity: Readonly<TEntity>,
  ): Result<void, AuthorizationError>;

  abstract resolveScope(
    actor: Principal<TAttributes>,
  ): Result<AccessScope<TConstraints>, AuthorizationError>;
}
