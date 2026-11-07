import { describe, expect, it } from 'vitest';
import { Result } from '@/shared/core/result';
import { AccessScope } from '@/shared/domain/auth/access-scope';
import { PermissionPolicy } from '@/shared/domain/auth/permission-policy';
import type { Principal } from '@/shared/domain/auth/principal';
import { ResourcePolicy } from '@/shared/domain/auth/resource-policy';
import { AuthorizeActionUseCase } from '@/modules/authz/application/authorize-action.use-case';
import { AuthorizeResourceUseCase } from '@/modules/authz/application/authorize-resource.use-case';
import { ResolveAccessScopeUseCase } from '@/modules/authz/application/resolve-access-scope.use-case';
import { AuthzErrorMapper } from '@/modules/authz/infrastructure/http/authz-error.mapper';
import { HttpResult } from '@/shared/infrastructure/http/http-result';

const actor: Principal = {
  id: 'actor-1',
  type: 'HUMAN',
  roles: ['admin'],
  permissions: ['projects.read', 'projects.update'],
  attributes: { organizationId: 'acme' },
};

interface Project { readonly id: string; readonly ownerId: string }
interface ProjectConstraints { readonly ownerId: string }

class ProjectPolicy extends ResourcePolicy<Project, 'read' | 'update', ProjectConstraints> {
  authorizeCalls = 0;
  scopeCalls = 0;

  authorize(principal: Principal, action: 'read' | 'update', entity: Readonly<Project>) {
    this.authorizeCalls++;
    return principal.id === entity.ownerId && action === 'read'
      ? Result.ok(undefined)
      : Result.err({ type: 'FORBIDDEN_RESOURCE_ACTION', action, resourceName: 'project' } as const);
  }

  resolveScope(principal: Principal) {
    this.scopeCalls++;
    return Result.ok(AccessScope.constrained<ProjectConstraints>({ ownerId: principal.id }));
  }
}

describe('authz foundation', () => {
  it('grants only explicit permissions, never infers them from roles or wildcards', () => {
    expect(PermissionPolicy.require(actor, 'projects.read')).toEqual(Result.ok(undefined));
    expect(new AuthorizeActionUseCase().execute({ actor, permission: 'projects.delete' })).toEqual(
      Result.err({ type: 'PERMISSION_DENIED', permission: 'projects.delete' }),
    );
    expect(PermissionPolicy.require(actor, '')).toEqual(Result.err({ type: 'PERMISSION_DENIED', permission: '' }));
    expect(PermissionPolicy.require({ ...actor, permissions: ['projects.*'] }, 'projects.read').ok).toBe(false);
    expect(PermissionPolicy.require({ ...actor, roles: ['projects.read'], permissions: [] }, 'projects.read').ok).toBe(false);
  });

  it('checks the permission before invoking a resource policy, then checks the entity', () => {
    const useCase = new AuthorizeResourceUseCase();
    const policy = new ProjectPolicy();
    const entity = { id: 'project-1', ownerId: 'actor-1' };
    const missing = useCase.execute({ actor, permission: 'projects.delete', action: 'read', entity, policy });
    expect(missing).toEqual(Result.err({ type: 'PERMISSION_DENIED', permission: 'projects.delete' }));
    expect(policy.authorizeCalls).toBe(0);
    expect(useCase.execute({ actor, permission: 'projects.read', action: 'read', entity, policy })).toEqual(Result.ok(undefined));
    expect(useCase.execute({ actor, permission: 'projects.update', action: 'update', entity, policy })).toEqual(
      Result.err({ type: 'FORBIDDEN_RESOURCE_ACTION', action: 'update', resourceName: 'project' }),
    );
    expect(useCase.execute({ actor, permission: 'projects.read', action: 'read', entity: { ...entity, ownerId: 'other' }, policy }).ok).toBe(false);
    expect(policy.authorizeCalls).toBe(3);
  });

  it('returns an explicit constrained scope and does not call the policy without permission', () => {
    const useCase = new ResolveAccessScopeUseCase();
    const policy = new ProjectPolicy();
    const denied = useCase.execute({ actor, permission: 'projects.delete', policy });
    expect(denied).toEqual(Result.err({ type: 'PERMISSION_DENIED', permission: 'projects.delete' }));
    expect(policy.scopeCalls).toBe(0);
    const allowed = useCase.execute({ actor, permission: 'projects.read', policy });
    expect(allowed).toEqual(Result.ok({ kind: 'CONSTRAINED', constraints: { ownerId: 'actor-1' } }));
    expect(policy.scopeCalls).toBe(1);
  });

  it('maps every AuthorizationError to RFC 9457 using an exhaustive matcher', () => {
    const errors = [
      { type: 'PERMISSION_DENIED', permission: 'secret.access' },
      { type: 'FORBIDDEN_RESOURCE_ACTION', action: 'delete', resourceName: 'invoice' },
      { type: 'ACCESS_SCOPE_DENIED', resourceName: 'invoice' },
    ] as const;
    for (const error of errors) {
      const http = HttpResult.from(Result.err(error), AuthzErrorMapper.toProblemDetails);
      expect(http._tag).toBe('HttpProblem');
      if (http._tag === 'HttpProblem') {
        expect(http.problem.status).toBe(403);
        expect(http.problem.code).toBe(error.type);
        expect(http.problem).not.toHaveProperty('permission');
      }
    }
  });
});
