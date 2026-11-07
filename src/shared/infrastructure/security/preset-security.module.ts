import { Global, Module } from '@nestjs/common';
import { RateLimiterPort } from '@/shared/application/ports/rate-limiter.port';
import { InMemoryRateLimiterAdapter } from './in-memory-rate-limiter.adapter';
import { AuthRateLimitGuard } from './auth-rate-limit.guard';
import { IdempotencyInterceptor } from '@/shared/infrastructure/http/interceptors/idempotency.interceptor';

@Global()
@Module({
  providers: [
    InMemoryRateLimiterAdapter,
    { provide: RateLimiterPort, useExisting: InMemoryRateLimiterAdapter },
    AuthRateLimitGuard,
    IdempotencyInterceptor,
  ],
  exports: [RateLimiterPort, AuthRateLimitGuard, IdempotencyInterceptor],
})
export class PresetSecurityModule {}
