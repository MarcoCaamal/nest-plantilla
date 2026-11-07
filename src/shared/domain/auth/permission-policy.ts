import { Result, type Result as ResultType } from '@/shared/core/result';
import type { AuthorizationError } from './authorization-error';
import type { Principal } from './principal';

/**
 * Permission strings are authoritative; roles never imply permissions here.
 * The authentication adapter may populate permissions from any external source.
 * Exact matching only: no implicit '*' or prefix grants.
 */
export const PermissionPolicy = {
  require<TAttributes extends object>(actor: Principal<TAttributes>, permission: string): ResultType<void, AuthorizationError> {
    return permission.length > 0 && actor.permissions.includes(permission)
      ? Result.ok(undefined)
      : Result.err({ type: 'PERMISSION_DENIED', permission });
  },
};
