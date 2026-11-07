import { ClockPort } from '@/shared/application/ports/clock.port';
import { IdGeneratorPort } from '@/shared/application/ports/id-generator.port';
import type { NewSession } from '../../domain/entities/session.entity';
import { OpaqueTokenGeneratorPort } from '../ports/opaque-token-generator.port';
import { TokenIssuerPort } from '../ports/token-issuer.port';
import type { DeviceContext, AuthTokens } from '../types';

/** Shared, small session/token coordination for login and refresh. */
export class SessionTokenService {
  constructor(private readonly ids: IdGeneratorPort, private readonly clock: ClockPort,
    private readonly opaque: OpaqueTokenGeneratorPort, private readonly issuer: TokenIssuerPort,
    private readonly accessTtlSeconds: number, private readonly refreshTtlDays: number) {}

  nextSession(userId: string, familyId: string, device: DeviceContext): { raw: string; record: NewSession } {
    const raw = this.opaque.generate();
    return {
      raw,
      record: {
        id: this.ids.generate(), userId, familyId,
        tokenHash: this.opaque.digest(raw),
        expiresAt: new Date(this.clock.now().getTime() + this.refreshTtlDays * 86400000),
        ...(device.userAgent ? { userAgent: device.userAgent.slice(0, 512) } : {}),
        ...(device.ipAddress ? { ipAddress: device.ipAddress.slice(0, 128) } : {}),
      },
    };
  }

  async tokens(userId: string, sessionId: string, raw: string): Promise<AuthTokens> {
    return {
      accessToken: await this.issuer.issue({ userId, sessionId }), refreshToken: raw,
      tokenType: 'Bearer', expiresIn: this.accessTtlSeconds,
    };
  }
}
