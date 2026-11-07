import { Injectable } from '@nestjs/common';
import { RateLimiterPort, type RateLimitError, type RateLimitPolicy } from '@/shared/application/ports/rate-limiter.port';
import { ClockPort } from '@/shared/application/ports/clock.port';

@Injectable()
export class InMemoryRateLimiterAdapter extends RateLimiterPort {
  private readonly records = new Map<string, { count: number; expiresAt: number }>();

  constructor(private readonly clock: ClockPort) { super(); }

  consume(key: string, policy: RateLimitPolicy): RateLimitError | null {
    const now = this.clock.now().getTime();
    const previous = this.records.get(key);
    const entry = !previous || previous.expiresAt <= now
      ? { count: 0, expiresAt: now + policy.windowSeconds * 1000 } : previous;
    entry.count++;
    this.records.set(key, entry);
    // Bounded memory under untrusted client IPs.
    if (this.records.size > 10000) {
      for (const [id, record] of this.records) {
        if (record.expiresAt <= now) this.records.delete(id);
      }
      if (this.records.size > 10000) this.records.delete(this.records.keys().next().value!);
    }
    if (entry.count <= policy.limit) return null;
    return { type: 'RATE_LIMITED', retryAfterSeconds: Math.ceil((entry.expiresAt - now) / 1000) };
  }
}
