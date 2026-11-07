import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Executable guardrail for ownership boundaries requested by the preset. */
const mandatoryFiles = [
  'auth/domain/entities/session.entity.ts',
  'auth/domain/errors/auth-domain.error.ts',
  'auth/application/ports/user-credential-verifier.port.ts',
  'auth/application/ports/session-repository.port.ts',
  'auth/application/ports/token-issuer.port.ts',
  'auth/application/ports/password-hasher.port.ts',
  'auth/application/use-cases/authenticate-user.use-case.ts',
  'auth/application/use-cases/loginWithPassword.use-case.ts',
  'auth/application/use-cases/refresh-session.use-case.ts',
  'auth/application/use-cases/revoke-session.use-case.ts',
  'auth/application/use-cases/request-password-reset.use-case.ts',
  'auth/application/use-cases/reset-password.use-case.ts',
  'auth/infrastructure/persistence/prisma-session.repository.ts',
  'auth/infrastructure/security/argon2-password-hasher.adapter.ts',
  'auth/infrastructure/security/jwt-token.adapter.ts',
  'auth/infrastructure/http/guards/user-authentication.guard.ts',
  'auth/infrastructure/http/public/auth.controller.ts',
  'auth/infrastructure/http/public/schemas/auth.schema.ts',
  'users/domain/entities/user.entity.ts',
  'users/domain/policies/user-resource.policy.ts',
  'users/domain/errors/user.error.ts',
  'users/application/ports/user-repository.port.ts',
  'users/application/use-cases/self/get-my-profile.use-case.ts',
  'users/application/use-cases/self/update-my-profile.use-case.ts',
  'users/application/use-cases/self/change-my-password.use-case.ts',
  'users/application/use-cases/backoffice/create-user.use-case.ts',
  'users/application/use-cases/backoffice/list-users.use-case.ts',
  'users/application/use-cases/backoffice/get-user-detail.use-case.ts',
  'users/application/use-cases/backoffice/change-user-status.use-case.ts',
  'users/application/use-cases/backoffice/assign-user-roles.use-case.ts',
  'users/infrastructure/persistence/prisma-user.repository.ts',
  'users/infrastructure/http/self/me.controller.ts',
  'users/infrastructure/http/self/schemas/me.schema.ts',
  'users/infrastructure/http/backoffice/backoffice-users.controller.ts',
  'users/infrastructure/http/backoffice/schemas/users.schema.ts',
  'iam/domain/entities/role.entity.ts',
  'iam/domain/entities/permission.entity.ts',
  'iam/domain/errors/iam.error.ts',
  'iam/application/ports/role-repository.port.ts',
  'iam/application/use-cases/create-role.use-case.ts',
  'iam/application/use-cases/update-role.use-case.ts',
  'iam/application/use-cases/delete-role.use-case.ts',
  'iam/application/use-cases/list-roles.use-case.ts',
  'iam/application/use-cases/set-role-permissions.use-case.ts',
  'iam/application/use-cases/list-permissions.use-case.ts',
  'iam/infrastructure/persistence/prisma-role.repository.ts',
  'iam/infrastructure/http/backoffice/backoffice-roles.controller.ts',
  'iam/infrastructure/http/backoffice/backoffice-permissions.controller.ts',
  'iam/infrastructure/http/backoffice/schemas/roles.schema.ts',
];

const source = (relative: string) => readFileSync(resolve('src/modules', relative), 'utf8');

describe('opinionated module layout', () => {
  it('has the requested auth / users / iam structure with real files', () => {
    for (const path of mandatoryFiles) {
      expect(existsSync(resolve('src/modules', path)), path).toBe(true);
      expect(source(path).trim().length, path).toBeGreaterThan(20);
    }
  });

  it('places role/permission controllers only in IAM and keeps permissions read-only', () => {
    const users = source('users/infrastructure/http/backoffice/backoffice-users.controller.ts');
    const roles = source('iam/infrastructure/http/backoffice/backoffice-roles.controller.ts');
    const permissions = source('iam/infrastructure/http/backoffice/backoffice-permissions.controller.ts');
    expect(users).not.toContain("@Controller('backoffice/roles')");
    expect(users).not.toContain("@Controller('backoffice/permissions')");
    expect(roles).toContain("@Controller('backoffice/roles')");
    expect(permissions).toContain("@Controller('backoffice/permissions')");
    expect(permissions).not.toMatch(/@(Post|Patch|Put|Delete)\(/);
    expect(permissions).toMatch(/@Get\(\)/);
    expect(permissions).toMatch(/@Get\(':key'\)/);
  });

  it('keeps /me in users and auth strictly about credentials/sessions', () => {
    const me = source('users/infrastructure/http/self/me.controller.ts');
    const auth = source('auth/infrastructure/http/public/auth.controller.ts');
    expect(me).toContain("@Controller('me')");
    expect(auth).toContain("@Controller('auth')");
    expect(auth).not.toMatch(/@Get\('me'\)/);
    expect(existsSync(resolve('src/modules/users/infrastructure/persistence/prisma-role.repository.ts'))).toBe(false);
    expect(existsSync(resolve('src/modules/users/application/use-cases/manage-rbac.use-case.ts'))).toBe(false);
  });
});
