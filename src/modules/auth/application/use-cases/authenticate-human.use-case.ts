import { Result, type Result as ResultType } from '@/shared/core/result';
import type { AuthenticationError } from '@/shared/domain/auth/authentication-error';
import { snapshotPrincipal, type HumanPrincipal } from '@/shared/domain/auth/principal';
import { HumanCredentialVerifierPort } from '../ports/human-credential-verifier.port';

export interface AuthenticateHumanInput {
  readonly credential: string;
}

/** A verified identity is always normalized before reaching authorization. */
export class AuthenticateHumanUseCase {
  constructor(private readonly verifier: HumanCredentialVerifierPort) {}

  async execute(input: AuthenticateHumanInput): Promise<ResultType<HumanPrincipal, AuthenticationError>> {
    if (!input.credential) return Result.err({ type: 'CREDENTIALS_MISSING' });
    const result = await this.verifier.verify(input.credential);
    if (!result.ok) return result;
    if (result.value.type !== 'HUMAN' || !result.value.id ||
      !Array.isArray(result.value.roles) || !Array.isArray(result.value.permissions)) {
      return Result.err({ type: 'CREDENTIALS_INVALID' });
    }
    return Result.ok(snapshotPrincipal(result.value));
  }
}
