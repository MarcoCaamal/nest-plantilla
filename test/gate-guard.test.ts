import 'reflect-metadata';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import type { Principal } from '@/shared/domain/auth/principal';
import { Authorize } from '@/shared/infrastructure/http/decorators/authorize.decorator';
import { GateGuard } from '@/shared/infrastructure/http/guards/gate.guard';

const actor: Principal = {
  id: 'actor-1',
  type: 'USER',
  roles: ['owner'],
  permissions: ['projects.read'],
  attributes: {},
};

class ProjectsController {
  list() {}
  delete() {}
  restricted() {}
  health() {}
}
Authorize('projects.read')(ProjectsController);
Authorize('projects.delete')(
  ProjectsController.prototype,
  'delete',
  Object.getOwnPropertyDescriptor(ProjectsController.prototype, 'delete')!,
);
Authorize('projects.read', (principal, req) => principal.id === req.params.ownerId)(
  ProjectsController.prototype,
  'restricted',
  Object.getOwnPropertyDescriptor(ProjectsController.prototype, 'restricted')!,
);

class PublicController {
  health() {}
}

function context(handler: () => void, controller: new () => object, request: unknown): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('GateGuard', () => {
  const guard = new GateGuard(new Reflector());

  it('allows unannotated handlers without a principal (public health)', () => {
    expect(guard.canActivate(context(PublicController.prototype.health, PublicController, {}))).toBe(true);
  });

  it('requires an authenticated principal on protected handlers (401)', () => {
    expect(() => guard.canActivate(context(ProjectsController.prototype.list, ProjectsController, {})))
      .toThrow(UnauthorizedException);
    try {
      guard.canActivate(context(ProjectsController.prototype.list, ProjectsController, {}));
    } catch (error) {
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect((error as UnauthorizedException).getStatus()).toBe(401);
    }
  });

  it('checks class metadata and allows explicitly granted permissions', () => {
    expect(guard.canActivate(context(ProjectsController.prototype.list, ProjectsController, { principal: actor }))).toBe(true);
  });

  it('method rule overrides class rule, denies missing permissions (403)', () => {
    const ctx = context(ProjectsController.prototype.delete, ProjectsController, { principal: actor });
    expect(guard.canActivate(ctx)).toBe(false);
    expect(guard.canActivate(context(ProjectsController.prototype.delete, ProjectsController, {
      principal: { ...actor, permissions: ['projects.delete'] },
    }))).toBe(true);
  });

  it('applies request-level predicates after permission validation', () => {
    const handler = ProjectsController.prototype.restricted;
    expect(guard.canActivate(context(handler, ProjectsController, {
      principal: actor, params: { ownerId: 'other' }, query: {}, body: {},
    }))).toBe(false);
    expect(guard.canActivate(context(handler, ProjectsController, {
      principal: actor, params: { ownerId: 'actor-1' }, query: {}, body: {},
    }))).toBe(true);
    expect(guard.canActivate(context(handler, ProjectsController, {
      principal: { ...actor, permissions: [] }, params: { ownerId: 'actor-1' }, query: {}, body: {},
    }))).toBe(false);
  });
});
