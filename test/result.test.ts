import { describe, expect, it } from 'vitest';
import { Result, type Result as BusinessResult } from '@/shared/core/result';

describe('Result', () => {
  it('returns a typed successful value', () => {
    const result: BusinessResult<string, never> = Result.ok('done');
    expect(result).toEqual({ ok: true, value: 'done' });
  });

  it('preserves errors as values without throwing', () => {
    const error = { type: 'NOT_FOUND', resourceId: '42' } as const;
    const result = Result.err(error);
    expect(result).toEqual({ ok: false, error });
    if (!result.ok) expect(result.error).toBe(error);
  });
});
