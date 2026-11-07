import type { Result } from '@/shared/core/result';
import type { AuthenticationError } from '@/shared/domain/auth/authentication-error';
import type { UserPrincipal } from '@/shared/domain/auth/principal';

/**
 * An adapter MUST validate signature/proof, expiry, issuer/audience and revocation
 * where relevant, then build an authoritative USER principal. No unverified claims.
 * May be implemented with JWT, opaque sessions or another user credential system.
 */
export abstract class UserCredentialVerifierPort {
  abstract verify(credential: string): Promise<Result<UserPrincipal, AuthenticationError>>;
}
