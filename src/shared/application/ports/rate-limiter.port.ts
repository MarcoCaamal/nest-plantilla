export interface RateLimitPolicy {
  readonly limit: number;
  readonly windowSeconds: number;
}
export type RateLimitError = { readonly type: 'RATE_LIMITED'; readonly retryAfterSeconds: number };

export abstract class RateLimiterPort {
  abstract consume(key: string, policy: RateLimitPolicy): RateLimitError | null;
}
