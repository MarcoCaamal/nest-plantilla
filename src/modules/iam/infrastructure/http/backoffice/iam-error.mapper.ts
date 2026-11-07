import { match } from 'ts-pattern';
import type { IamError } from '../../../domain/errors/iam.error';
import type { ProblemDetails } from '@/shared/infrastructure/http/http-result';

export const IamErrorMapper = {
  toProblemDetails(error: IamError): ProblemDetails {
    return match(error.type)
      .with('FORBIDDEN', () => ({ type: 'about:blank', title: 'Forbidden', status: 403, code: 'FORBIDDEN' }))
      .with('NOT_FOUND', () => ({ type: 'about:blank', title: 'Not Found', status: 404, code: 'NOT_FOUND' }))
      .with('CONFLICT', 'PROTECTED_ROLE', () => ({ type: 'about:blank', title: 'Conflict', status: 409, code: 'CONFLICT' }))
      .exhaustive();
  },
};
