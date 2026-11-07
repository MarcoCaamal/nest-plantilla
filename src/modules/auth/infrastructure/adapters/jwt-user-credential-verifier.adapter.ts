import { Injectable } from '@nestjs/common';
import { jwtVerify, errors } from 'jose';
import { UserCredentialVerifierPort } from '../../application/ports/user-credential-verifier.port';
import { Result, type Result as ResultType } from '@/shared/core/result';
import type { UserPrincipal } from '@/shared/domain/auth/principal';
import type { AuthenticationError } from '@/shared/domain/auth/authentication-error';
import { UserRepositoryPort } from '@/modules/users/public';
import { AppConfig } from '@/shared/infrastructure/config/app-config';
import type { PresetEnv } from '@/shared/infrastructure/config/env.schema';
import { AuthSessionRepositoryPort } from '../../application/ports/auth-session-repository.port';

@Injectable()
export class JwtUserCredentialVerifierAdapter extends UserCredentialVerifierPort {
  constructor(
    private readonly config: AppConfig<PresetEnv>,
    private readonly users: UserRepositoryPort,
    private readonly sessions: AuthSessionRepositoryPort,
  ) { super(); }

  async verify(credential: string): Promise<ResultType<UserPrincipal, AuthenticationError>> {
    let subject: string;
    let sessionId: string;
    try {
      const verified = await jwtVerify(
        credential, new TextEncoder().encode(this.config.get('JWT_ACCESS_SECRET')),
        { algorithms: ['HS256'], issuer: this.config.get('SERVICE_NAME'), audience: 'nest-plantilla-users' },
      );
      if (verified.protectedHeader.typ !== 'JWT' ||
          typeof verified.payload.sub !== 'string' ||
          typeof verified.payload.sid !== 'string') {
        return Result.err({ type: 'CREDENTIALS_INVALID' });
      }
      subject = verified.payload.sub;
      sessionId = verified.payload.sid;
    } catch (error) {
      if (error instanceof errors.JWTExpired) return Result.err({ type: 'CREDENTIALS_EXPIRED' });
      if (error instanceof errors.JOSEError || error instanceof TypeError) {
        return Result.err({ type: 'CREDENTIALS_INVALID' });
      }
      throw error;
    }
    const sessionActive = await this.sessions.isActive(sessionId, subject, new Date());
    if (!sessionActive) return Result.err({ type: 'CREDENTIALS_INVALID' });
    const user = await this.users.findById(subject);
    if (!user || user.status !== 'ACTIVE') return Result.err({ type: 'IDENTITY_INACTIVE' });
    return Result.ok({
      id: user.id, type: 'USER', roles: user.roles, permissions: user.permissions,
      attributes: { sessionId },
    });
  }
}
