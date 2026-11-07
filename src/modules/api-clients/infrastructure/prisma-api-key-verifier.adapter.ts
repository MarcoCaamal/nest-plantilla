import { createHash, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Result, type Result as ResultType } from '@/shared/core/result';
import type { MachinePrincipal } from '@/shared/domain/auth/principal';
import type { AuthenticationError } from '@/shared/domain/auth/authentication-error';
import { PrismaHost } from '@/shared/infrastructure/persistence/prisma-unit-of-work';
import { ApiKeyVerifierPort } from '../application/ports/api-key-verifier.port';

@Injectable()
export class PrismaApiKeyVerifierAdapter extends ApiKeyVerifierPort {
  constructor(private readonly host: PrismaHost) { super(); }

  async verify(apiKey: string): Promise<ResultType<MachinePrincipal, AuthenticationError>> {
    if (apiKey.length < 32 || apiKey.length > 512) return Result.err({ type: 'CREDENTIALS_INVALID' });
    const digest = createHash('sha256').update(apiKey).digest();
    const prefix = apiKey.slice(0, 16);
    const possible = await this.host.client.apiClient.findMany({ where: { keyPrefix: prefix } });
    // Constant-time comparison of equal-sized binary SHA-256 digests.
    const found = possible.find((client) =>
      timingSafeEqual(Buffer.from(client.keyHash, 'hex'), digest));
    if (!found || !found.active || (found.expiresAt && found.expiresAt <= new Date())) {
      return Result.err({ type: 'CREDENTIALS_INVALID' });
    }
    await this.host.client.apiClient.update({ where: { id: found.id }, data: { lastUsedAt: new Date() } });
    return Result.ok({
      id: found.id, type: 'MACHINE', roles: [], permissions: found.permissions,
      attributes: { scopes: found.scopes },
    });
  }
}
