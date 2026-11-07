import { describe, expect, it } from 'vitest';
import { Result } from '@/shared/core/result';
import { HttpResult } from '@/shared/infrastructure/http/http-result';

describe('HttpResult', () => {
  it('maps business errors into RFC 9457 without exceptions', () => {
    const problem = HttpResult.from(
      Result.err({ type: 'NOT_FOUND' } as const),
      (error) => ({
        type: 'https://example.test/problems/not-found',
        title: 'Not Found', status: 404, code: error.type,
      }),
    );
    expect(problem).toEqual({
      _tag: 'HttpProblem',
      problem: { type: 'https://example.test/problems/not-found', title: 'Not Found', status: 404, code: 'NOT_FOUND' },
    });
  });

  it('supports success status 201', () => {
    const success = HttpResult.from(Result.ok({ id: 'test' }), () => ({ type: 'about:blank', title: 'Error', status: 500 }), 201);
    expect(success).toEqual({ _tag: 'HttpSuccess', status: 201, data: { id: 'test' } });
  });
});
