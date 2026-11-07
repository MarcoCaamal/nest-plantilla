import { describe, expect, it } from 'vitest';
import { validate as validateUuid, version as uuidVersion } from 'uuid';
import { UuidV7Generator } from '@/shared/infrastructure/system/uuid-v7-generator';
import { Argon2PasswordHasherAdapter } from '@/modules/auth/infrastructure/security/argon2-password-hasher.adapter';
import { parseEnv, EnvironmentValidationError } from '@/shared/infrastructure/config/app-config';
import { presetEnvSchema } from '@/shared/infrastructure/config/env.schema';
import { scopedPrismaWhere } from '@/shared/infrastructure/persistence/scoped-prisma-where';
import { AccessScope } from '@/shared/domain/auth/access-scope';

describe('opinionated system adapters', () => {
  it('generates time-ordered RFC 9562 UUID v7 IDs', () => {
    const generator = new UuidV7Generator();
    const ids = Array.from({ length: 30 }, () => generator.generate());
    expect(new Set(ids).size).toBe(30);
    for (const id of ids) {
      expect(validateUuid(id)).toBe(true);
      expect(uuidVersion(id)).toBe(7);
    }
    expect([...ids].sort()).toEqual(ids);
  });

  it('hashes and verifies Argon2id with OWASP minimum params', async () => {
    const adapter = new Argon2PasswordHasherAdapter();
    const hash = await adapter.hash('My-very-long-test-password-01');
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(await adapter.verify(hash, 'My-very-long-test-password-01')).toBe(true);
    expect(await adapter.verify(hash, 'incorrect')).toBe(false);
  });

  it('validates preset-only environment without modifying the base schema', () => {
    const env = parseEnv({
      DATABASE_URL: 'postgresql://localhost:5433/testdb',
      JWT_ACCESS_SECRET: 'a-secure-secret-for-unit-tests-not-for-real-use',
      MAIL_FROM: 'system@example.test',
      CORS_ORIGINS: 'http://localhost:4200,https://example.test',
    }, presetEnvSchema);
    expect(env.PORT).toBe(3000);
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:4200', 'https://example.test']);
    expect(env.JWT_ACCESS_TTL_SECONDS).toBe(900);
    expect(env.REFRESH_TOKEN_TTL_DAYS).toBe(30);
    expect(env.MAILPIT_PORT).toBe(1025);
    expect(() => parseEnv({
      DATABASE_URL: 'mysql://localhost/database',
      JWT_ACCESS_SECRET: 'abc',
      MAIL_FROM: 'invalid',
    }, presetEnvSchema)).toThrow(EnvironmentValidationError);
  });

  it('intersects authorization scope and user filters with AND', () => {
    const constrained = scopedPrismaWhere(
      AccessScope.constrained({ id: 'only-this-user' }),
      { email: { contains: 'example' } },
    );
    expect(constrained).toEqual({
      AND: [{ id: 'only-this-user' }, { email: { contains: 'example' } }],
    });
    expect(scopedPrismaWhere(AccessScope.unrestricted(), { id: 'one' })).toEqual({ id: 'one' });
  });

});
