import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { UuidV7Generator } from '@/shared/infrastructure/system/uuid-v7-generator';
import { Argon2PasswordHasherAdapter } from '@/modules/auth/infrastructure/security/argon2-password-hasher.adapter';
import {
  Module, StandardSchemaValidationPipe, type INestApplication,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '@/app.module';
import { AppConfig, ConfigModule, parseEnv } from '@/shared/infrastructure/config/app-config';
import { presetEnvSchema } from '@/shared/infrastructure/config/env.schema';
import { PrismaModule } from '@/shared/infrastructure/persistence/prisma.module';
import { PrismaService } from '@/shared/infrastructure/persistence/prisma.service';
import { PresetSystemModule } from '@/shared/infrastructure/system/preset-system.module';
import { PresetSecurityModule } from '@/shared/infrastructure/security/preset-security.module';
import { OutboxModule } from '@/shared/infrastructure/outbox/outbox.module';
import { JwtAuthnModule } from '@/modules/auth/jwt-authn.module';
import { AuthPresetModule } from '@/modules/auth/auth-preset.module';
import { ApiClientsPresetModule } from '@/modules/api-clients/api-clients-preset.module';
import { IamModule } from '@/modules/iam/public';
import { GlobalExceptionFilter } from '@/shared/infrastructure/http/filters/global-exception.filter';
import { HttpResultInterceptor } from '@/shared/infrastructure/http/interceptors/http-result.interceptor';

const database = process.env.TEST_DATABASE_URL;
const run = database ? describe : describe.skip;

run('Nest HTTP opinionated preset (real PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let base: string;
  const id = randomUUID();
  const email = 'http-'+id+'@example.test';
  const password = 'Http-Strong-Password-for-Tests-2026';
  let backofficeUserId: string | undefined;
  let backofficeRoleId: string | undefined;
  let apiClientId: string | undefined;
  let createdUserId: string | undefined;
  let backofficeToken: string | undefined;
  let genericToken: string | undefined;

  async function request(
    path: string,
    options: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
  ): Promise<{ status: number; headers: Headers; body: Record<string, unknown> }> {
    const response = await fetch(base + path, {
      method: options.method ?? 'GET',
      headers: {
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...options.headers,
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
    const text = await response.text();
    return { status: response.status, headers: response.headers, body: text ? JSON.parse(text) : null };
  }

  beforeAll(async () => {
    const config = new AppConfig(parseEnv({
      NODE_ENV: 'test',
      DATABASE_URL: database!,
      JWT_ACCESS_SECRET: 'test-secret-abcdefghijklmnopqrstuvwxyz-0123456789',
      MAIL_FROM: 'test@example.test',
    }, presetEnvSchema));
    class TestPresetApp {}
    Module({
      imports: [
        AppModule, ConfigModule.register(config), PrismaModule, PresetSystemModule,
        PresetSecurityModule, OutboxModule, JwtAuthnModule, AuthPresetModule, IamModule, ApiClientsPresetModule,
      ],
    })(TestPresetApp);
    app = await NestFactory.create(TestPresetApp, { logger: false });
    app.useGlobalPipes(new StandardSchemaValidationPipe());
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalInterceptors(new HttpResultInterceptor());
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as { port: number };
    base = 'http://127.0.0.1:' + address.port;
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (prisma) {
      const user = await prisma.user.findUnique({ where: { email } });
      if (user) {
        await prisma.outboxMessage.deleteMany({
          where: { payload: { path: ['aggregateId'], equals: user.id } },
        });
        await prisma.user.deleteMany({ where: { id: user.id } });
      }
      if (apiClientId) await prisma.apiClient.deleteMany({ where: { id: apiClientId } });
      if (createdUserId) await prisma.user.deleteMany({ where: { id: createdUserId } });
      if (backofficeUserId) await prisma.user.deleteMany({ where: { id: backofficeUserId } });
      if (backofficeRoleId) await prisma.role.deleteMany({ where: { id: backofficeRoleId } });
      await prisma.role.deleteMany({ where: { key: 'http-rbac-'+id } });
      await prisma.idempotencyRecord.deleteMany({ where: { actorId: { startsWith: 'anonymous:' } } });
    }
    if (app) await app.close();
  });

  it('exposes protected backoffice routes without legacy staff aliases', async () => {
    for (const path of ['/backoffice/users', '/backoffice/roles', '/backoffice/permissions']) {
      expect((await request(path)).status).toBe(401);
    }
    for (const path of ['/staff/users', '/staff/roles', '/staff/permissions', '/staff/api-clients']) {
      expect((await request(path)).status).toBe(404);
    }
  });

  it('validates HTTP, stores events, verifies account, JWT login, refresh and reuse', async () => {
    const invalid = await request('/auth/register', { method: 'POST', body: { email, password: 'short' } });
    expect(invalid.status).toBe(400);
    expect(invalid.body).toMatchObject({ status: 400 });

    const registered = await request('/auth/register', {
      method: 'POST', body: { email, password },
      headers: { 'Idempotency-Key': 'http-integration-'+id },
    });
    expect(registered.status).toBe(201);
    expect(registered.body.status).toBe('PENDING_VERIFICATION');

    const repeated = await request('/auth/register', {
      method: 'POST', body: { email, password },
      headers: { 'Idempotency-Key': 'http-integration-'+id },
    });
    expect(repeated.status).toBe(201);
    expect(repeated.body).toEqual(registered.body);

    const event = await prisma.outboxMessage.findFirst({
      where: { eventName: 'account.verify_email_requested', payload: { path: ['aggregateId'], equals: registered.body.id } },
    });
    expect(event).not.toBeNull();
    const payload = event?.payload as { token: string };
    const verified = await request('/auth/verify-email', {
      method: 'POST', body: { token: payload.token },
    });
    expect(verified.status).toBe(200);

    const login = await request('/auth/login', {
      method: 'POST', body: { email, password },
    });
    expect(login.status).toBe(200);
    expect(login.body).toMatchObject({ tokenType: 'Bearer', expiresIn: 900 });
    expect(typeof login.body.accessToken).toBe('string');

    const me = await request('/me', {
      headers: { Authorization: 'Bearer ' + login.body.accessToken },
    });
    expect(me.status).toBe(200);
    expect(me.body.id).toBe(registered.body.id);

    const forbidden = await request('/backoffice/users', {
      headers: { Authorization: 'Bearer ' + login.body.accessToken },
    });
    expect(forbidden.status).toBe(403);

    const rotated = await request('/auth/refresh', {
      method: 'POST', body: { refreshToken: login.body.refreshToken },
    });
    expect(rotated.status).toBe(200);
    const replay = await request('/auth/refresh', {
      method: 'POST', body: { refreshToken: login.body.refreshToken },
    });
    expect(replay.status).toBe(401);
    expect(replay.body).toMatchObject({ code: 'AUTHENTICATION_FAILED' });

    const invalidNewToken = await request('/me', {
      headers: { Authorization: 'Bearer ' + rotated.body.accessToken },
    });
    expect(invalidNewToken.status).toBe(401);
  });

  it('provisions hashed API keys, verifies MachinePrincipal, and enforces backoffice RBAC', async () => {
    const generator = new UuidV7Generator();
    backofficeUserId = generator.generate();
    backofficeRoleId = generator.generate();
    const backofficeEmail = 'backoffice-'+id+'@example.test';
    const backofficePassword = 'TestBackoffice-Password-Long-2026';
    await prisma.user.create({
      data: {
        id: backofficeUserId, email: backofficeEmail,
        passwordHash: await new Argon2PasswordHasherAdapter().hash(backofficePassword),
        status: 'ACTIVE', emailVerifiedAt: new Date(),
      },
    });
    await prisma.role.create({
      data: { id: backofficeRoleId, key: 'http-test-'+id, name: 'HTTP Test Backoffice' },
    });
    await prisma.userRole.create({
      data: { id: generator.generate(), userId: backofficeUserId, roleId: backofficeRoleId },
    });
    for (const key of ['users:read', 'users:write', 'roles:read', 'roles:write', 'permissions:read', 'api-clients:write']) {
      const permission = await prisma.permission.upsert({
        where: { key },
        create: { id: generator.generate(), key },
        update: {},
      });
      await prisma.rolePermission.create({
        data: { id: generator.generate(), roleId: backofficeRoleId, permissionId: permission.id },
      });
    }

    const login = await request('/auth/login', {
      method: 'POST', body: { email: backofficeEmail, password: backofficePassword },
    });
    expect(login.status).toBe(200);
    const token = login.body.accessToken as string;
    const users = await request('/backoffice/users', {
      headers: { Authorization: 'Bearer ' + token },
    });
    expect(users.status).toBe(200);
    const client = await request('/backoffice/api-clients', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
      body: { name: 'HTTP integration partner', scopes: ['contracts:read'], permissions: ['users:read'] },
    });
    expect(client.status).toBe(201);
    apiClientId = client.body.id as string;
    const apiKey = client.body.key as string;
    const stored = await prisma.apiClient.findUnique({ where: { id: apiClientId } });
    expect(stored?.keyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored?.keyHash).not.toBe(apiKey);
    expect(apiKey).toMatch(/^np_/);
    const machine = await request('/partner-b2b/whoami', {
      headers: { 'X-API-Key': apiKey },
    });
    expect(machine.status).toBe(200);
    expect(machine.body.type).toBe('MACHINE');
    expect(machine.body.id).toBe(apiClientId);
    expect((await request('/partner-b2b/whoami', {
      headers: { 'X-API-Key': 'not-a-valid-key' },
    })).status).toBe(401);
    expect((await request('/partner-b2b/whoami', {
      headers: { Authorization: 'Bearer ' + token },
    })).status).toBe(401);
  });
  it('manages roles for generic users but exposes permissions through GET only', async () => {
    const backofficeLogin = await request('/auth/login', {
      method: 'POST', body: {
        email: 'backoffice-'+id+'@example.test', password: 'TestBackoffice-Password-Long-2026',
      },
    });
    expect(backofficeLogin.status).toBe(200);
    const adminToken = backofficeLogin.body.accessToken as string;
    backofficeToken = adminToken;
    const auth = { Authorization: 'Bearer ' + adminToken };
    const registered = await prisma.user.findUniqueOrThrow({ where: { email } });

    const permissions = await request('/backoffice/permissions', { headers: auth });
    expect(permissions.status).toBe(200);
    const catalog = permissions.body as unknown as Array<{ id: string; key: string }>;
    expect(catalog.map((entry) => entry.key)).toContain('roles:write');
    expect(catalog.map((entry) => entry.key)).toContain('permissions:read');
    expect(catalog.map((entry) => entry.key)).toEqual([...catalog.map((entry) => entry.key)].sort());
    const readPermission = await request('/backoffice/permissions/users:read', { headers: auth });
    expect(readPermission.status).toBe(200);
    expect(readPermission.body).toMatchObject({ key: 'users:read' });
    expect((await request('/backoffice/permissions/no:such', { headers: auth })).status).toBe(404);
    for (const method of ['POST', 'PATCH', 'DELETE']) {
      const rejected = await request('/backoffice/permissions', {
        method, headers: auth, body: { key: 'not:createable' },
      });
      expect(rejected.status).toBe(404);
    }
    expect((await request('/backoffice/permissions')).status).toBe(401);

    const genericLogin = await request('/auth/login', {
      method: 'POST', body: { email, password },
    });
    expect(genericLogin.status).toBe(200);
    genericToken = genericLogin.body.accessToken as string;
    const genericAuth = { Authorization: 'Bearer ' + genericLogin.body.accessToken };
    expect((await request('/backoffice/permissions', { headers: genericAuth })).status).toBe(403);
    expect((await request('/backoffice/roles', { headers: genericAuth })).status).toBe(403);
    expect((await request('/backoffice/roles', {
      method: 'POST', headers: genericAuth, body: { key: 'forbidden-role', name: 'Forbidden Role' },
    })).status).toBe(403);

    const key = 'http-rbac-'+id;
    const created = await request('/backoffice/roles', {
      method: 'POST', headers: auth, body: { key, name: 'Read-only role' },
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ key, name: 'Read-only role', permissions: [] });
    expect((await request('/backoffice/roles', {
      method: 'POST', headers: auth, body: { key, name: 'Duplicate role' },
    })).status).toBe(409);

    const updated = await request('/backoffice/roles/'+key, {
      method: 'PATCH', headers: auth,
      body: { name: 'Updated reader', description: 'Generic user role' },
    });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ key, name: 'Updated reader', description: 'Generic user role' });
    expect((await request('/backoffice/roles/'+key, {
      method: 'PATCH', headers: auth, body: {},
    })).status).toBe(400);
    expect((await request('/backoffice/roles/'+key, {
      method: 'POST', headers: auth, body: { permissionKey: 'unknown:permission' },
    })).status).toBe(404);

    for (let i = 0; i < 2; i++) {
      expect((await request('/backoffice/roles/'+key+'/permissions', {
        method: 'POST', headers: auth, body: { permissionKey: 'users:read' },
      })).status).toBe(200);
    }
    expect((await request('/backoffice/roles/unknown-role/permissions', {
      method: 'POST', headers: auth, body: { permissionKey: 'users:read' },
    })).status).toBe(404);

    const withPermission = await request('/backoffice/roles/'+key, { headers: auth });
    expect(withPermission.body).toMatchObject({ permissions: ['users:read'] });

    const assign = await request('/backoffice/users/'+registered.id+'/roles', {
      method: 'POST', headers: auth, body: { roleKey: key },
    });
    expect(assign.status).toBe(200);
    const withRole = await request('/me', { headers: genericAuth });
    expect(withRole.status).toBe(200);
    expect(withRole.body.roles).toContain(key);
    expect(withRole.body.permissions).toContain('users:read');
    expect((await request('/backoffice/users', { headers: genericAuth })).status).toBe(200);

    const removed = await request('/backoffice/users/'+registered.id+'/roles/'+key, {
      method: 'DELETE', headers: auth,
    });
    expect(removed.status).toBe(200);
    const afterRemoval = await request('/me', { headers: genericAuth });
    expect(afterRemoval.body.roles).not.toContain(key);
    expect(afterRemoval.body.permissions).not.toContain('users:read');
    expect((await request('/backoffice/users', { headers: genericAuth })).status).toBe(403);

    expect((await request('/backoffice/roles/'+key+'/permissions/users:read', {
      method: 'DELETE', headers: auth,
    })).status).toBe(200);
    expect((await request('/backoffice/roles/'+key, { headers: auth })).body.permissions).toEqual([]);
    expect((await request('/backoffice/roles/admin/permissions/users:read', {
      method: 'DELETE', headers: auth,
    })).status).toBe(409);
    expect((await request('/backoffice/roles/admin', { method: 'DELETE', headers: auth })).status).toBe(409);
    expect((await request('/backoffice/roles/'+key, { method: 'DELETE', headers: auth })).status).toBe(200);
    expect((await request('/backoffice/roles/'+key, { headers: auth })).status).toBe(404);
  });

  it('supports self-service profile changes and revokes sessions after password rotation', async () => {
    const auth = { Authorization: 'Bearer ' + genericToken! };
    expect((await request('/auth/me', { headers: auth })).status).toBe(404);
    const profile = await request('/me', { headers: auth });
    expect(profile.status).toBe(200);
    expect(profile.body).toMatchObject({ email, status: 'ACTIVE', displayName: null });
    expect('passwordHash' in profile.body).toBe(false);
    expect((await request('/me', { method: 'PATCH', headers: auth, body: {
      displayName: 'Example', roles: ['admin'],
    } })).status).toBe(400);
    const updated = await request('/me', {
      method: 'PATCH', headers: auth, body: { displayName: 'Generic User' },
    });
    expect(updated.status).toBe(200);
    expect(updated.body.displayName).toBe('Generic User');
    expect('passwordHash' in updated.body).toBe(false);
    expect((await request('/me/change-password', {
      method: 'POST', headers: auth, body: {
        currentPassword: 'not-correct', newPassword: 'Updated-Password-Long-2026',
      },
    })).status).toBe(401);
    const correct = await request('/me/change-password', {
      method: 'POST', headers: auth, body: {
        currentPassword: password, newPassword: 'Updated-Password-Long-2026',
      },
    });
    expect(correct.status).toBe(200);
    expect((await request('/me', { headers: auth })).status).toBe(401);
    const persisted = await prisma.user.findUniqueOrThrow({ where: { email } });
    const hasher = new Argon2PasswordHasherAdapter();
    expect(await hasher.verify(persisted.passwordHash, 'Updated-Password-Long-2026')).toBe(true);
    expect(await hasher.verify(persisted.passwordHash, password)).toBe(false);
  });

  it('provisions generic backoffice accounts and changes their status', async () => {
    const auth = { Authorization: 'Bearer ' + backofficeToken! };
    const created = await request('/backoffice/users', {
      method: 'POST', headers: auth, body: {
        email: 'provisioned-'+id+'@example.test',
        password: 'Secure-Temporary-Account-2026', displayName: 'Provisioned User',
      },
    });
    expect(created.status).toBe(201);
    createdUserId = created.body.id as string;
    expect(created.body.displayName).toBe('Provisioned User');
    expect('passwordHash' in created.body).toBe(false);
    expect((await request('/backoffice/users/'+createdUserId, { headers: auth })).status).toBe(200);
    const suspended = await request('/backoffice/users/'+createdUserId+'/status', {
      method: 'PATCH', headers: auth, body: { status: 'SUSPENDED' },
    });
    expect(suspended.body.status).toBe('SUSPENDED');
    expect((await request('/backoffice/users/'+backofficeUserId+'/status', {
      method: 'PATCH', headers: auth, body: { status: 'SUSPENDED' },
    })).status).toBe(409);
  });

  it('returns RFC 9457 with Retry-After on brute-force attempts', async () => {
    const attempts: number[] = [];
    for (let i = 0; i < 7; i++) {
      const response = await request('/auth/login', {
        method: 'POST', body: { email: 'unknown-'+id+'@example.test', password: 'incorrect' },
      });
      attempts.push(response.status);
      if (response.status === 429) {
        expect(response.headers.get('retry-after')).not.toBeNull();
        expect(response.body).toMatchObject({ status: 429, code: 'RATE_LIMITED' });
        break;
      }
    }
    expect(attempts).toContain(429);
  });

});
