import { Injectable } from '@nestjs/common';
import { SignJWT } from 'jose';
import { AppConfig } from '@/shared/infrastructure/config/app-config';
import type { PresetEnv } from '@/shared/infrastructure/config/env.schema';
import { TokenIssuerPort } from '../../application/ports/token-issuer.port';

@Injectable()
export class JwtTokenAdapter extends TokenIssuerPort {
  constructor(private readonly config: AppConfig<PresetEnv>) { super(); }

  async issue(input: Readonly<{ userId: string; sessionId: string }>): Promise<string> {
    return new SignJWT({ sid: input.sessionId })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(input.userId)
      .setIssuer(this.config.get('SERVICE_NAME'))
      .setAudience('nest-plantilla-users')
      .setIssuedAt()
      .setExpirationTime(this.config.get('JWT_ACCESS_TTL_SECONDS') + 's')
      .sign(new TextEncoder().encode(this.config.get('JWT_ACCESS_SECRET')));
  }
}
