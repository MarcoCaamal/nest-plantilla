import { Result } from '@/shared/core/result';
import { AccessScope } from '@/shared/domain/auth/access-scope';
import type { AuthorizationError } from '@/shared/domain/auth/authorization-error';
import type { Principal } from '@/shared/domain/auth/principal';
import { ResourcePolicy } from '@/shared/domain/auth/resource-policy';
import type { User } from '../entities/user';
import type { UserScopeConstraints } from '../ports/user-repository.port';

/** Admin grants an unrestricted user listing; others can only read themselves. */
export class UsersPolicy extends ResourcePolicy<User, 'read' | 'write', UserScopeConstraints> {
  authorize(actor: Principal, action: 'read' | 'write', entity: Readonly<User>) {
    if (actor.permissions.includes('users:write')) return Result.ok(undefined);
    if (action === 'read' && actor.id === entity.id) return Result.ok(undefined);
    return Result.err<AuthorizationError>({ type: 'PERMISSION_DENIED', permission: 'users:' + action });
  }

  resolveScope(actor: Principal) {
    if (actor.permissions.includes('users:read')) return Result.ok(AccessScope.unrestricted<UserScopeConstraints>());
    return Result.ok(AccessScope.constrained<UserScopeConstraints>({ allowedUserIds: [actor.id] }));
  }
}
