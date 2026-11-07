import type { Result } from '@/shared/core/result';
import type { AuthorizationError } from '@/shared/domain/auth/authorization-error';
import { PermissionPolicy } from '@/shared/domain/auth/permission-policy';
import type { Principal } from '@/shared/domain/auth/principal';
import type { ResourcePolicy } from '@/shared/domain/auth/resource-policy';

export interface AuthorizeResourceInput<
  TEntity,
  TAction extends string,
  TConstraints,
  TAttributes extends object,
> {
  readonly actor: Principal<TAttributes>;
  readonly permission: string;
  readonly action: TAction;
  readonly entity: Readonly<TEntity>;
  readonly policy: ResourcePolicy<TEntity, TAction, TConstraints, TAttributes>;
}

/** Permissions first, then pure domain resource authorization (no I/O). */
export class AuthorizeResourceUseCase {
  execute<TEntity, TAction extends string, TConstraints, TAttributes extends object>(
    input: AuthorizeResourceInput<TEntity, TAction, TConstraints, TAttributes>,
  ): Result<void, AuthorizationError> {
    const granted = PermissionPolicy.require(input.actor, input.permission);
    return granted.ok
      ? input.policy.authorize(input.actor, input.action, input.entity)
      : granted;
  }
}
