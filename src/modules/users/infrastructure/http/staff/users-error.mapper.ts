import { match } from 'ts-pattern';
import type { RbacError } from '../../../application/use-cases/manage-rbac.use-case';
import type { AuthorizationError } from '@/shared/domain/auth/authorization-error';
import type { ProblemDetails } from '@/shared/infrastructure/http/http-result';

export const UsersErrorMapper = {
  toProblemDetails(error: RbacError | AuthorizationError): ProblemDetails {
    return match(error.type)
      .with('FORBIDDEN', 'PERMISSION_DENIED', 'FORBIDDEN_RESOURCE_ACTION', 'ACCESS_SCOPE_DENIED',
        () => ({ type: 'about:blank', title: 'Forbidden', status: 403, code: 'FORBIDDEN' }))
      .with('CONFLICT', 'PROTECTED_ROLE',
        () => ({ type: 'about:blank', title: 'Conflict', status: 409, code: 'CONFLICT' }))
      .with('NOT_FOUND',
        () => ({ type: 'about:blank', title: 'Not Found', status: 404, code: 'NOT_FOUND' }))
      .exhaustive();
  },
};
