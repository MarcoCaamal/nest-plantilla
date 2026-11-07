import { match } from 'ts-pattern';
import type { UserError } from '../../../domain/errors/user.error';
import type { AuthorizationError } from '@/shared/domain/auth/authorization-error';
import type { ProblemDetails } from '@/shared/infrastructure/http/http-result';

export const UsersErrorMapper = {
  toProblemDetails(error: UserError | AuthorizationError): ProblemDetails {
    return match(error.type)
      .with('FORBIDDEN', 'PERMISSION_DENIED', 'FORBIDDEN_RESOURCE_ACTION', 'ACCESS_SCOPE_DENIED',
        () => ({ type: 'about:blank', title: 'Forbidden', status: 403, code: 'FORBIDDEN' }))
      .with('CONFLICT', 'PROTECTED_USER',
        () => ({ type: 'about:blank', title: 'Conflict', status: 409, code: 'CONFLICT' }))
      .with('INVALID_PASSWORD',
        () => ({ type: 'about:blank', title: 'Unauthorized', status: 401, code: 'INVALID_PASSWORD' }))
      .with('NOT_FOUND',
        () => ({ type: 'about:blank', title: 'Not Found', status: 404, code: 'NOT_FOUND' }))
      .exhaustive();
  },
};
