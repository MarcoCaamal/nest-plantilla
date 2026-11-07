import type { Result } from '@/shared/core/result';

export interface ProblemDetails {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail?: string;
  readonly instance?: string;
  readonly code?: string;
}

export type HttpResponseEnvelope<T> =
  | { readonly _tag: 'HttpSuccess'; readonly status: number; readonly data: T }
  | { readonly _tag: 'HttpProblem'; readonly problem: ProblemDetails };

export const HttpResult = {
  from<T, E>(
    result: Result<T, E>,
    errorMapper: (error: E) => ProblemDetails,
    successStatus = 200,
  ): HttpResponseEnvelope<T> {
    return result.ok
      ? { _tag: 'HttpSuccess', status: successStatus, data: result.value }
      : { _tag: 'HttpProblem', problem: errorMapper(result.error) };
  },
};
