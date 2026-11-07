import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { map, type Observable } from 'rxjs';
import type { HttpResponseEnvelope } from '../http-result';

type HttpResponse = {
  status(code: number): HttpResponse;
  type(contentType: string): HttpResponse;
};

function isEnvelope(value: unknown): value is HttpResponseEnvelope<unknown> {
  return typeof value === 'object' && value !== null && '_tag' in value &&
    (value._tag === 'HttpSuccess' || value._tag === 'HttpProblem');
}

/** No HttpException is needed: Problem Details are normal HTTP responses. */
@Injectable()
export class HttpResultInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const response = context.switchToHttp().getResponse<HttpResponse>();
    return next.handle().pipe(map((value: unknown) => {
      if (!isEnvelope(value)) return value;
      if (value._tag === 'HttpSuccess') {
        response.status(value.status);
        return value.data;
      }
      response.status(value.problem.status).type('application/problem+json');
      return value.problem;
    }));
  }
}
