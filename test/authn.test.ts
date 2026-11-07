import { describe, expect, it } from 'vitest';
import { Result, type Result as ResultType } from '@/shared/core/result';
import type { AuthenticationError } from '@/shared/domain/auth/authentication-error';
import { snapshotPrincipal, type HumanPrincipal, type MachinePrincipal } from '@/shared/domain/auth/principal';
import { AuthenticationErrorMapper } from '@/shared/infrastructure/http/authentication-error.mapper';
import {
  readApiKeyCredential,
  readBearerCredential,
} from '@/shared/infrastructure/http/credentials/credential-reader';
import { HumanCredentialVerifierPort } from '@/modules/auth/public';
import { AuthenticateHumanUseCase } from '@/modules/auth/public';
import { ApiKeyVerifierPort, AuthenticateApiClientUseCase } from '@/modules/api-clients/public';

const human: HumanPrincipal = {
  id: 'user-01',
  type: 'HUMAN',
  roles: ['staff'],
  permissions: ['orders:read'],
  attributes: { tenantId: 'tenant-01' },
};
const machine: MachinePrincipal = {
  id: 'app-01',
  type: 'MACHINE',
  roles: ['integration'],
  permissions: ['orders:read'],
  attributes: { tenantId: 'tenant-01' },
};

class HumanVerifier extends HumanCredentialVerifierPort {
  async verify(credential: string): Promise<ResultType<HumanPrincipal, AuthenticationError>> {
    if (credential === 'expired') return Result.err({ type: 'CREDENTIALS_EXPIRED' });
    return credential === 'valid'
      ? Result.ok(human)
      : Result.err({ type: 'CREDENTIALS_INVALID' });
  }
}

class MachineVerifier extends ApiKeyVerifierPort {
  async verify(apiKey: string): Promise<ResultType<MachinePrincipal, AuthenticationError>> {
    return apiKey === 'key-valid'
      ? Result.ok(machine)
      : Result.err({ type: 'CREDENTIALS_INVALID' });
  }
}

describe('credential extraction (protocol boundary)', () => {
  it('accepts JWT-shaped and opaque Bearer credentials without decoding them', () => {
    expect(readBearerCredential({ authorization: 'Bearer aaa.bbb.ccc' })).toEqual(Result.ok('aaa.bbb.ccc'));
    expect(readBearerCredential({ authorization: 'bearer opaque-key' })).toEqual(Result.ok('opaque-key'));
  });

  it('denies missing, malformed, Basic, duplicate and ambiguous bearer credentials', () => {
    expect(readBearerCredential({})).toEqual(Result.err({ type: 'CREDENTIALS_MISSING' }));
    for (const authorization of ['Basic abc', 'Bearer', 'Bearer x y', 'Bearer abc,def', ' Bearer abc']) {
      expect(readBearerCredential({ authorization })).toEqual(Result.err({ type: 'CREDENTIALS_INVALID' }));
    }
    expect(readBearerCredential({ authorization: ['Bearer one', 'Bearer two'] }))
      .toEqual(Result.err({ type: 'CREDENTIALS_INVALID' }));
    expect(readBearerCredential({ authorization: 'Bearer x', 'x-api-key': 'key' }))
      .toEqual(Result.err({ type: 'CREDENTIALS_INVALID' }));
  });

  it('denies missing, empty, multiline, duplicate and ambiguous API keys', () => {
    expect(readApiKeyCredential({})).toEqual(Result.err({ type: 'CREDENTIALS_MISSING' }));
    for (const key of ['', 'a b', 'abc,def', 'a\nb', 'a\u0000b']) {
      expect(readApiKeyCredential({ 'x-api-key': key })).toEqual(Result.err({ type: 'CREDENTIALS_INVALID' }));
    }
    expect(readApiKeyCredential({ 'x-api-key': ['a', 'b'] }))
      .toEqual(Result.err({ type: 'CREDENTIALS_INVALID' }));
    expect(readApiKeyCredential({ authorization: 'Bearer abc', 'x-api-key': 'key' }))
      .toEqual(Result.err({ type: 'CREDENTIALS_INVALID' }));
    expect(readApiKeyCredential({ 'x-api-key': 'key-valid' })).toEqual(Result.ok('key-valid'));
  });
});

describe('authentication use cases', () => {
  it('authenticates human and machine separately, and freezes principals', async () => {
    const humanResult = await new AuthenticateHumanUseCase(new HumanVerifier()).execute({ credential: 'valid' });
    const machineResult = await new AuthenticateApiClientUseCase(new MachineVerifier()).execute({ apiKey: 'key-valid' });
    expect(humanResult.ok).toBe(true);
    expect(machineResult.ok).toBe(true);
    if (humanResult.ok && machineResult.ok) {
      expect(humanResult.value.type).toBe('HUMAN');
      expect(machineResult.value.type).toBe('MACHINE');
      expect(Object.isFrozen(humanResult.value)).toBe(true);
      expect(Object.isFrozen(humanResult.value.roles)).toBe(true);
      expect(Object.isFrozen(humanResult.value.permissions)).toBe(true);
      expect(Object.isFrozen(humanResult.value.attributes)).toBe(true);
      expect(Object.isFrozen(machineResult.value)).toBe(true);
    }
  });

  it('propagates the original expected error, not an exception', async () => {
    expect(await new AuthenticateHumanUseCase(new HumanVerifier()).execute({ credential: 'expired' }))
      .toEqual(Result.err({ type: 'CREDENTIALS_EXPIRED' }));
    expect(await new AuthenticateApiClientUseCase(new MachineVerifier()).execute({ apiKey: 'wrong' }))
      .toEqual(Result.err({ type: 'CREDENTIALS_INVALID' }));
  });

  it('rejects a dishonest adapter returning the wrong actor type', async () => {
    const dishonestHuman = {
      verify: async () => Result.ok(machine as unknown as HumanPrincipal),
    } satisfies HumanCredentialVerifierPort;
    const dishonestMachine = {
      verify: async () => Result.ok(human as unknown as MachinePrincipal),
    } satisfies ApiKeyVerifierPort;
    expect(await new AuthenticateHumanUseCase(dishonestHuman).execute({ credential: 'x' }))
      .toEqual(Result.err({ type: 'CREDENTIALS_INVALID' }));
    expect(await new AuthenticateApiClientUseCase(dishonestMachine).execute({ apiKey: 'x' }))
      .toEqual(Result.err({ type: 'CREDENTIALS_INVALID' }));
  });

  it('does not swallow technical failures as Result.err', async () => {
    const panic = new Error('repository connection unavailable');
    const failing = { verify: async (): Promise<never> => Promise.reject(panic) } satisfies HumanCredentialVerifierPort;
    await expect(new AuthenticateHumanUseCase(failing).execute({ credential: 'x' })).rejects.toBe(panic);
  });
});

describe('immutable principal snapshots', () => {
  it('deep copies nested authorization attributes without mutating verifier claims', () => {
    const input = {
      id: 'human-test',
      type: 'HUMAN' as const,
      roles: ['staff'],
      permissions: ['orders:read'],
      attributes: { tenantIds: ['tenant-01'], details: { flags: ['one'] } },
    };
    const principal = snapshotPrincipal(input);
    input.attributes.tenantIds.push('tenant-02');
    input.attributes.details.flags.push('two');

    expect(principal.attributes.tenantIds).toEqual(['tenant-01']);
    expect(principal.attributes.details.flags).toEqual(['one']);
    expect(Object.isFrozen(principal.attributes.tenantIds)).toBe(true);
    expect(Object.isFrozen(principal.attributes.details.flags)).toBe(true);
  });
});

describe('exhaustive auth error mapping', () => {
  it('always maps expected authentication failures to RFC 9457 401', () => {
    const errors: AuthenticationError[] = [
      { type: 'CREDENTIALS_MISSING' },
      { type: 'CREDENTIALS_INVALID' },
      { type: 'CREDENTIALS_EXPIRED' },
      { type: 'IDENTITY_INACTIVE' },
    ];
    for (const error of errors) {
      const problem = AuthenticationErrorMapper.toProblemDetails(error);
      expect(problem).toMatchObject({ type: 'about:blank', title: 'Unauthorized', status: 401 });
      if (error.type !== 'CREDENTIALS_MISSING') {
        expect(problem.code).toBe('AUTHENTICATION_FAILED');
      }
      expect(JSON.stringify(problem)).not.toContain('repository');
    }
  });
});
