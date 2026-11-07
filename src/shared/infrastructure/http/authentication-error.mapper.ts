import { match } from 'ts-pattern';
import type { AuthenticationError } from '@/shared/domain/auth/authentication-error';
import type { ProblemDetails } from './http-result';

/** Intentionally never reveals whether a token, user, API key or account exists. */
export const AuthenticationErrorMapper = {
  toProblemDetails(error: AuthenticationError): ProblemDetails {
    const code = match(error)
      .with({ type: 'CREDENTIALS_MISSING' }, () => 'CREDENTIALS_MISSING' as const)
      .with({ type: 'CREDENTIALS_INVALID' }, () => 'AUTHENTICATION_FAILED' as const)
      .with({ type: 'CREDENTIALS_EXPIRED' }, () => 'AUTHENTICATION_FAILED' as const)
      .with({ type: 'IDENTITY_INACTIVE' }, () => 'AUTHENTICATION_FAILED' as const)
      .exhaustive();

    return {
      type: 'about:blank',
      title: 'Unauthorized',
      status: 401,
      detail: 'Authentication is required',
      code,
    };
  },
};
