import { ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerLimitDetail } from '@nestjs/throttler';

/**
 * NestJS Throttler is the rate-limiting implementation. This HTTP-only
 * specialization preserves the application's RFC 9457 error contract.
 */
@Injectable()
export class AuthThrottlerGuard extends ThrottlerGuard {
  protected override async throwThrottlingException(
    context: ExecutionContext,
    { timeToBlockExpire }: ThrottlerLimitDetail,
  ): Promise<void> {
    // Throttler's storage returns the remaining time in seconds.
    context.switchToHttp().getResponse<{ setHeader(name: string, value: string): void }>()
      .setHeader('Retry-After', String(Math.max(1, Math.ceil(timeToBlockExpire))));

    throw new HttpException({
      type: 'about:blank',
      title: 'Too Many Requests',
      status: HttpStatus.TOO_MANY_REQUESTS,
      code: 'RATE_LIMITED',
      detail: 'Request rate exceeded',
    }, HttpStatus.TOO_MANY_REQUESTS);
  }
}
