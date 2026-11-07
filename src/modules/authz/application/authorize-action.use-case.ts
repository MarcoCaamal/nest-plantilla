import type { Result } from '@/shared/core/result';
import type { AuthorizationError } from '@/shared/domain/auth/authorization-error';
import { PermissionPolicy } from '@/shared/domain/auth/permission-policy';
import type { Principal } from '@/shared/domain/auth/principal';

export interface AuthorizeActionInput {
  readonly actor: Principal;
  readonly permission: string;
}

/** Authorizes a permission already resolved into the authenticated principal. */
export class AuthorizeActionUseCase {
  execute(input: AuthorizeActionInput): Result<void, AuthorizationError> {
    return PermissionPolicy.require(input.actor, input.permission);
  }
}
