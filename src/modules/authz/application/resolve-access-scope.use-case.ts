import type { Result } from '@/shared/core/result';
import type { AccessScope } from '@/shared/domain/auth/access-scope';
import type { AuthorizationError } from '@/shared/domain/auth/authorization-error';
import { PermissionPolicy } from '@/shared/domain/auth/permission-policy';
import type { Principal } from '@/shared/domain/auth/principal';
import type { ResourcePolicy } from '@/shared/domain/auth/resource-policy';

export interface ResolveAccessScopeInput<
  TEntity,
  TAction extends string,
  TConstraints,
  TAttributes extends object,
> {
  readonly actor: Principal<TAttributes>;
  readonly permission: string;
  readonly policy: ResourcePolicy<TEntity, TAction, TConstraints, TAttributes>;
}

/**
 * Returns an explicit scope, never an empty object interpreted as "all".
 * The repository adapter MUST intersect that scope with user filters using AND.
 */
export class ResolveAccessScopeUseCase {
  execute<TEntity, TAction extends string, TConstraints, TAttributes extends object>(
    input: ResolveAccessScopeInput<TEntity, TAction, TConstraints, TAttributes>,
  ): Result<AccessScope<TConstraints>, AuthorizationError> {
    const granted = PermissionPolicy.require(input.actor, input.permission);
    return granted.ok ? input.policy.resolveScope(input.actor) : granted;
  }
}
