import { Result, type Result as ResultType } from '@/shared/core/result';
import type { AuthenticationError } from '@/shared/domain/auth/authentication-error';
import { snapshotPrincipal, type UserPrincipal } from '@/shared/domain/auth/principal';
import { UserCredentialVerifierPort } from '../ports/user-credential-verifier.port';

export interface AuthenticateUserInput {
  readonly credential: string;
}

/** A verified identity is always normalized before reaching authorization. */
export class AuthenticateUserUseCase {
  constructor(private readonly verifier: UserCredentialVerifierPort) {}

  async execute(input: AuthenticateUserInput): Promise<ResultType<UserPrincipal, AuthenticationError>> {
    if (!input.credential) return Result.err({ type: 'CREDENTIALS_MISSING' });
    const result = await this.verifier.verify(input.credential);
    if (!result.ok) return result;
    if (result.value.type !== 'USER' || !result.value.id ||
      !Array.isArray(result.value.roles) || !Array.isArray(result.value.permissions)) {
      return Result.err({ type: 'CREDENTIALS_INVALID' });
    }
    return Result.ok(snapshotPrincipal(result.value));
  }
}
