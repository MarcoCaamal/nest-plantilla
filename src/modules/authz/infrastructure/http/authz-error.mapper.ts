import { match } from 'ts-pattern';
import type { AuthorizationError } from '@/shared/domain/auth/authorization-error';
import type { ProblemDetails } from '@/shared/infrastructure/http/http-result';

/** Shared HTTP mapping; domain/application know nothing about HTTP status codes. */
export const AuthzErrorMapper = {
  toProblemDetails(error: AuthorizationError): ProblemDetails {
    const detail = match(error)
      .with({ type: 'PERMISSION_DENIED' }, () => 'Permission denied')
      .with({ type: 'FORBIDDEN_RESOURCE_ACTION' }, () => 'Resource action forbidden')
      .with({ type: 'ACCESS_SCOPE_DENIED' }, () => 'Access scope denied')
      .exhaustive();

    return {
      type: 'about:blank',
      title: 'Forbidden',
      status: 403,
      code: error.type,
      detail,
    };
  },
};
