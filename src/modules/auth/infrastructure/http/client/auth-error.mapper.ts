import { match } from 'ts-pattern';
import type { AuthFlowError } from '../../../application/auth-flows';
import type { ProblemDetails } from '@/shared/infrastructure/http/http-result';

export const AuthFlowErrorMapper = {
  toProblemDetails(error: AuthFlowError): ProblemDetails {
    return match(error.type)
      .with('INVALID_CREDENTIALS', 'IDENTITY_INACTIVE', 'REFRESH_INVALID', 'REFRESH_REUSED', 'TOKEN_INVALID',
        () => ({ type: 'about:blank', title: 'Unauthorized', status: 401, code: 'AUTHENTICATION_FAILED' }))
      .with('EMAIL_TAKEN',
        () => ({ type: 'about:blank', title: 'Conflict', status: 409, code: 'EMAIL_TAKEN' }))
      .exhaustive();
  },
};
