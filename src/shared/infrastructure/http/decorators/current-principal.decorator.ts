import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Principal } from '@/shared/domain/auth/principal';

/** Configure an auth guard for the audience before using this decorator. */
export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Principal | undefined => {
    const request = context.switchToHttp().getRequest<{ principal?: Principal }>();
    return request.principal;
  },
);
