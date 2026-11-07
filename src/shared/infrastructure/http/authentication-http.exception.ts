import { HttpException } from '@nestjs/common';
import type { AuthenticationError } from '@/shared/domain/auth/authentication-error';
import { AuthenticationErrorMapper } from './authentication-error.mapper';

/** Protocol boundary only: Nest guards must interrupt handler execution on 401. */
export class AuthenticationHttpException extends HttpException {
  constructor(error: AuthenticationError) {
    const problem = AuthenticationErrorMapper.toProblemDetails(error);
    super(problem, problem.status);
  }
}
