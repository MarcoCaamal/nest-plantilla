import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { ProblemDetails } from '../http-result';

type ErrorResponse = {
  status(statusCode: number): ErrorResponse;
  type(contentType: string): ErrorResponse;
  json(body: ProblemDetails): unknown;
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<ErrorResponse>();
    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    if (status >= 500) {
      // Never expose infrastructure stack traces or internal messages to callers.
      this.logger.error({
        event: 'http.unhandled_exception',
        statusCode: status,
        error: exception instanceof Error ? {
          name: exception.name,
          message: exception.message,
          stack: exception.stack,
        } : { name: 'UnknownError' },
      });
    }

    const problem: ProblemDetails = getExplicitProblem(exception, status) ?? {
      type: 'about:blank',
      title: status === 500 ? 'Internal Server Error' : errorTitle(status),
      status,
      ...(status >= 500 ? {} : { detail: safeHttpDetail(exception) }),
    };

    response.status(status).type('application/problem+json').json(problem);
  }
}

function errorTitle(status: number): string {
  switch (status) {
    case 400: return 'Bad Request';
    case 401: return 'Unauthorized';
    case 403: return 'Forbidden';
    case 404: return 'Not Found';
    case 409: return 'Conflict';
    case 422: return 'Unprocessable Content';
    default: return 'HTTP Error';
  }
}

function safeHttpDetail(exception: unknown): string {
  if (!(exception instanceof HttpException)) return 'Request could not be processed';
  const value: unknown = exception.getResponse();
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null && 'message' in value) {
    const message: unknown = value.message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.filter((item): item is string => typeof item === 'string').join('; ');
  }
  return exception.message;
}


/** Preserve deliberately mapped Problem Details from protocol adapters (e.g. 401 guards). */
function getExplicitProblem(exception: unknown, status: number): ProblemDetails | undefined {
  if (!(exception instanceof HttpException)) return undefined;
  const body: unknown = exception.getResponse();
  if (typeof body !== 'object' || body === null) return undefined;
  if (!('type' in body) || typeof body.type !== 'string' ||
      !('title' in body) || typeof body.title !== 'string' ||
      !('status' in body) || body.status !== status) return undefined;
  const detail = 'detail' in body && typeof body.detail === 'string' ? body.detail : undefined;
  const code = 'code' in body && typeof body.code === 'string' ? body.code : undefined;
  return {
    type: body.type,
    title: body.title,
    status,
    ...(detail === undefined ? {} : { detail }),
    ...(code === undefined ? {} : { code }),
  };
}
