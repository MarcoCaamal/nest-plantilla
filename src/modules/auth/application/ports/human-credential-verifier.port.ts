import type { Result } from '@/shared/core/result';
import type { AuthenticationError } from '@/shared/domain/auth/authentication-error';
import type { HumanPrincipal } from '@/shared/domain/auth/principal';

/**
 * An adapter MUST validate signature/proof, expiry, issuer/audience and revocation
 * where relevant, then build an authoritative HUMAN principal. No unverified claims.
 * May be implemented with JWT, opaque sessions or another human credential system.
 */
export abstract class HumanCredentialVerifierPort {
  abstract verify(credential: string): Promise<Result<HumanPrincipal, AuthenticationError>>;
}
