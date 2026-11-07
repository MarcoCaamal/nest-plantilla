import type { Result } from '@/shared/core/result';
import type { AuthenticationError } from '@/shared/domain/auth/authentication-error';
import type { MachinePrincipal } from '@/shared/domain/auth/principal';

/**
 * Verify API key authenticity, expiry, revocation, application status and scopes.
 * A concrete adapter must protect secrets at rest and avoid logging raw keys.
 */
export abstract class ApiKeyVerifierPort {
  abstract verify(apiKey: string): Promise<Result<MachinePrincipal, AuthenticationError>>;
}
