import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AuthenticationHttpException } from '@/shared/infrastructure/http/authentication-http.exception';
import {
  readBearerCredential,
  type AuthenticatedHttpRequest,
} from '@/shared/infrastructure/http/credentials/credential-reader';
import { AuthenticateHumanUseCase } from '../../../application/use-cases/authenticate-human.use-case';

/**
 * Use BEFORE GateGuard: @UseGuards(HumanAuthenticationGuard, GateGuard).
 * Throws only at Nest's protocol boundary, never in the application use case.
 */
@Injectable()
export class HumanAuthenticationGuard implements CanActivate {
  constructor(private readonly authenticate: AuthenticateHumanUseCase) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedHttpRequest>();
    // Never trust a principal previously attached by other middleware.
    delete request.principal;
    const credential = readBearerCredential(request.headers);
    if (!credential.ok) {
      context.switchToHttp().getResponse<{ setHeader(name: string, value: string): void }>()
        .setHeader('WWW-Authenticate', 'Bearer realm="api"');
      throw new AuthenticationHttpException(credential.error);
    }

    const result = await this.authenticate.execute({ credential: credential.value });
    if (!result.ok) {
      context.switchToHttp().getResponse<{ setHeader(name: string, value: string): void }>()
        .setHeader('WWW-Authenticate', 'Bearer realm="api"');
      throw new AuthenticationHttpException(result.error);
    }

    request.principal = result.value;
    return true;
  }
}
