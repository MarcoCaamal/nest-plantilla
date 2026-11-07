import 'reflect-metadata';
import {
  Controller,
  Get,
  Module,
  UseGuards,
  type INestApplication,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Result, type Result as ResultType } from '@/shared/core/result';
import type { AuthenticationError } from '@/shared/domain/auth/authentication-error';
import type { UserPrincipal, MachinePrincipal, Principal } from '@/shared/domain/auth/principal';
import {
  AuthModule,
  UserAuthenticationGuard,
  UserCredentialVerifierPort,
} from '@/modules/auth/public';
import {
  ApiClientsModule,
  ApiKeyAuthenticationGuard,
  ApiKeyVerifierPort,
} from '@/modules/api-clients/public';
import { AuthzModule } from '@/modules/authz/public';
import { Authorize } from '@/shared/infrastructure/http/decorators/authorize.decorator';
import { CurrentPrincipal } from '@/shared/infrastructure/http/decorators/current-principal.decorator';
import { GlobalExceptionFilter } from '@/shared/infrastructure/http/filters/global-exception.filter';
import { GateGuard } from '@/shared/infrastructure/http/guards/gate.guard';

const user: UserPrincipal = {
  id: 'user-test',
  type: 'USER',
  roles: ['operator'],
  permissions: ['records:read'],
  attributes: { tenantId: 'tenant-test' },
};
const machine: MachinePrincipal = {
  id: 'machine-test',
  type: 'MACHINE',
  roles: ['partner'],
  permissions: ['records:read'],
  attributes: { tenantId: 'tenant-test' },
};

class TestUserVerifier extends UserCredentialVerifierPort {
  async verify(token: string): Promise<ResultType<UserPrincipal, AuthenticationError>> {
    if (token === 'panic') throw new Error('private technical failure');
    if (token === 'expired') return Result.err({ type: 'CREDENTIALS_EXPIRED' });
    if (token === 'suspended') return Result.err({ type: 'IDENTITY_INACTIVE' });
    if (token === 'denied') return Result.ok({ ...user, permissions: [] });
    return token === 'valid' ? Result.ok(user) : Result.err({ type: 'CREDENTIALS_INVALID' });
  }
}
class TestApiKeyVerifier extends ApiKeyVerifierPort {
  async verify(key: string): Promise<ResultType<MachinePrincipal, AuthenticationError>> {
    if (key === 'disabled') return Result.err({ type: 'IDENTITY_INACTIVE' });
    return key === 'api-valid' ? Result.ok(machine) : Result.err({ type: 'CREDENTIALS_INVALID' });
  }
}

/** Test-only adapters are never registered into the actual AppModule.
 * Apply decorators programmatically because Vitest's TS transform is not a
 * full legacy TypeScript decorator emitter for test fixtures.
 */
class FixtureController {
  publicEndpoint(): object { return { status: 'ok' }; }

  userEndpoint(principal: Principal): object {
    return { id: principal.id, type: principal.type };
  }

  machineEndpoint(principal: Principal): object {
    return { id: principal.id, type: principal.type };
  }
}

Controller('fixture')(FixtureController);
function decorateMethod(name: 'publicEndpoint' | 'userEndpoint' | 'machineEndpoint', decorators: MethodDecorator[]): void {
  const descriptor = Object.getOwnPropertyDescriptor(FixtureController.prototype, name);
  for (const decorator of decorators) {
    decorator(FixtureController.prototype, name, descriptor!);
  }
}
decorateMethod('publicEndpoint', [Get('public')]);
decorateMethod('userEndpoint', [
  Get('user'),
  UseGuards(UserAuthenticationGuard, GateGuard),
  Authorize('records:read'),
]);
decorateMethod('machineEndpoint', [
  Get('machine'),
  UseGuards(ApiKeyAuthenticationGuard, GateGuard),
  Authorize('records:read'),
]);
CurrentPrincipal()(FixtureController.prototype, 'userEndpoint', 0);
CurrentPrincipal()(FixtureController.prototype, 'machineEndpoint', 0);

class FixtureModule {}
Module({
  imports: [
    AuthzModule,
    AuthModule.register({
      verifier: { provide: UserCredentialVerifierPort, useClass: TestUserVerifier },
    }),
    ApiClientsModule.register({
      verifier: { provide: ApiKeyVerifierPort, useClass: TestApiKeyVerifier },
    }),
  ],
  controllers: [FixtureController],
})(FixtureModule);

describe('HTTP authentication + authorization composition', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    app = await NestFactory.create(FixtureModule, { logger: false });
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('keeps unprotected endpoints accessible', async () => {
    const response = await fetch(baseUrl + '/fixture/public');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('returns 401 with RFC 9457 and challenge for missing Bearer token', async () => {
    const response = await fetch(baseUrl + '/fixture/user');
    expect(response.status).toBe(401);
    expect(response.headers.get('content-type')).toContain('application/problem+json');
    expect(response.headers.get('www-authenticate')).toContain('Bearer');
    expect(await response.json()).toMatchObject({ status: 401, code: 'CREDENTIALS_MISSING' });
  });

  it('returns 401 for invalid, expired and inactive credentials without leaking private state', async () => {
    for (const token of ['bad', 'expired', 'suspended']) {
      const response = await fetch(baseUrl + '/fixture/user', {
        headers: { Authorization: 'Bearer ' + token },
      });
      const body = await response.json() as { detail: string; status: number };
      expect(response.status).toBe(401);
      expect(body.status).toBe(401);
      expect(body.detail).not.toContain(token);
    }
  });

  it('returns 403 when authenticated but not authorized', async () => {
    const response = await fetch(baseUrl + '/fixture/user', {
      headers: { Authorization: 'Bearer denied' },
    });
    expect(response.status).toBe(403);
    expect(response.headers.get('content-type')).toContain('application/problem+json');
    expect(await response.json()).toMatchObject({ status: 403 });
  });

  it('passes a trusted user Principal through @CurrentPrincipal', async () => {
    const response = await fetch(baseUrl + '/fixture/user', {
      headers: { Authorization: 'Bearer valid' },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: 'user-test', type: 'USER' });
  });

  it('denies ambiguous credentials instead of selecting one', async () => {
    const response = await fetch(baseUrl + '/fixture/user', {
      headers: { Authorization: 'Bearer valid', 'x-api-key': 'api-valid' },
    });
    expect(response.status).toBe(401);
  });

  it('rejects a bearer token on API-key endpoints and a missing API key', async () => {
    const bearer = await fetch(baseUrl + '/fixture/machine', {
      headers: { Authorization: 'Bearer valid' },
    });
    const missing = await fetch(baseUrl + '/fixture/machine');
    expect(bearer.status).toBe(401);
    expect(missing.status).toBe(401);
  });

  it('authenticates a machine independently of users', async () => {
    const response = await fetch(baseUrl + '/fixture/machine', {
      headers: { 'x-api-key': 'api-valid' },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: 'machine-test', type: 'MACHINE' });
  });

  it('turns unexpected provider errors into safe HTTP 500 without disclosing stack', async () => {
    const response = await fetch(baseUrl + '/fixture/user', {
      headers: { Authorization: 'Bearer panic' },
    });
    const body = await response.text();
    expect(response.status).toBe(500);
    expect(response.headers.get('content-type')).toContain('application/problem+json');
    expect(body).not.toContain('private technical failure');
    expect(body).not.toContain('at TestUserVerifier');
  });
});
