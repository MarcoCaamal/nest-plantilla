import { Global, Module } from '@nestjs/common';
import { ThrottlerModule, seconds } from '@nestjs/throttler';
import { AuthThrottlerGuard } from './auth-throttler.guard';
import { IdempotencyInterceptor } from '@/shared/infrastructure/http/interceptors/idempotency.interceptor';

/** ThrottlerGuard is opt-in per endpoint; public endpoints are not globally limited. */
@Global()
@Module({
  imports: [
    ThrottlerModule.forRoot([{ limit: 5, ttl: seconds(60), blockDuration: 0 }]),
  ],
  providers: [AuthThrottlerGuard, IdempotencyInterceptor],
  exports: [AuthThrottlerGuard, IdempotencyInterceptor],
})
export class PresetSecurityModule {}
