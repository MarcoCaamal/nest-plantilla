import { createHash } from 'node:crypto';
import { CanActivate, ExecutionContext, HttpException, Injectable } from '@nestjs/common';
import { RateLimiterPort } from '@/shared/application/ports/rate-limiter.port';

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  constructor(private readonly rateLimiter: RateLimiterPort) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ ip?: string; path?: string }>();
    const path = request.path ?? '';
    const policy = path.endsWith('/login')
      ? { limit: 5, windowSeconds: 60 }
      : path.endsWith('/refresh') ? { limit: 15, windowSeconds: 60 }
        : { limit: 3, windowSeconds: 60 };
    const key = createHash('sha256').update(path + ':' + (request.ip ?? 'unknown')).digest('hex');
    const error = this.rateLimiter.consume(key, policy);
    if (!error) return true;
    context.switchToHttp().getResponse<{ setHeader(name: string, value: string): void }>()
      .setHeader('Retry-After', String(error.retryAfterSeconds));
    throw new HttpException({
      type: 'about:blank', title: 'Too Many Requests', status: 429,
      code: 'RATE_LIMITED', detail: 'Request rate exceeded',
    }, 429);
  }
}
