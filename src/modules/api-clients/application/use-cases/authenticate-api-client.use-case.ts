import { Result, type Result as ResultType } from '@/shared/core/result';
import type { AuthenticationError } from '@/shared/domain/auth/authentication-error';
import { snapshotPrincipal, type MachinePrincipal } from '@/shared/domain/auth/principal';
import { ApiKeyVerifierPort } from '../ports/api-key-verifier.port';

export interface AuthenticateApiClientInput {
  readonly apiKey: string;
}

/** Authenticates machine identities without knowing how API keys are stored. */
export class AuthenticateApiClientUseCase {
  constructor(private readonly verifier: ApiKeyVerifierPort) {}

  async execute(input: AuthenticateApiClientInput): Promise<ResultType<MachinePrincipal, AuthenticationError>> {
    if (!input.apiKey) return Result.err({ type: 'CREDENTIALS_MISSING' });
    const result = await this.verifier.verify(input.apiKey);
    if (!result.ok) return result;
    if (result.value.type !== 'MACHINE' || !result.value.id ||
      !Array.isArray(result.value.roles) || !Array.isArray(result.value.permissions)) {
      return Result.err({ type: 'CREDENTIALS_INVALID' });
    }
    return Result.ok(snapshotPrincipal(result.value));
  }
}
