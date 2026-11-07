import { Result, type Result as ResultType } from '@/shared/core/result';
import type { AuthenticationError } from '@/shared/domain/auth/authentication-error';
import type { Principal } from '@/shared/domain/auth/principal';

export interface CredentialHeaders {
  readonly authorization?: string | readonly string[];
  readonly 'x-api-key'?: string | readonly string[];
}

export type AuthenticatedHttpRequest = {
  readonly headers: CredentialHeaders;
  principal?: Principal;
};

/** RFC 6750 Bearer syntax, without presuming JWT or opaque tokens. */
const bearerPattern = /^Bearer +([A-Za-z0-9._~+/-]+=*)$/i;
const invalid = (): ResultType<never, AuthenticationError> =>
  Result.err({ type: 'CREDENTIALS_INVALID' });

export function readBearerCredential(headers: CredentialHeaders): ResultType<string, AuthenticationError> {
  // Two competing identities must not silently win by guard order.
  if (headers['x-api-key'] !== undefined) return invalid();
  const header = headers.authorization;
  if (header === undefined) return Result.err({ type: 'CREDENTIALS_MISSING' });
  if (typeof header !== 'string' || header.length > 8192) return invalid();
  const token = bearerPattern.exec(header)?.[1];
  return token ? Result.ok(token) : invalid();
}

export function readApiKeyCredential(headers: CredentialHeaders): ResultType<string, AuthenticationError> {
  if (headers.authorization !== undefined) return invalid();
  const header = headers['x-api-key'];
  if (header === undefined) return Result.err({ type: 'CREDENTIALS_MISSING' });
  // Do not permit whitespace, control characters, combined headers or empty keys.
  if (typeof header !== 'string' || header.length === 0 || header.length > 4096 ||
    (/[\s,]/.test(header) || [...header].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127))) return invalid();
  return Result.ok(header);
}
