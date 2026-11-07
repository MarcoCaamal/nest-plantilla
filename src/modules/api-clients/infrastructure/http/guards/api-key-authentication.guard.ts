import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AuthenticationHttpException } from '@/shared/infrastructure/http/authentication-http.exception';
import { requestContext } from '@/shared/infrastructure/observability/context/request-context';
import {
  readApiKeyCredential,
  type AuthenticatedHttpRequest,
} from '@/shared/infrastructure/http/credentials/credential-reader';
import { AuthenticateApiClientUseCase } from '../../../application/use-cases/authenticate-api-client.use-case';

/** Machine audience only. Use before GateGuard on B2B endpoints. */
@Injectable()
export class ApiKeyAuthenticationGuard implements CanActivate {
  constructor(private readonly authenticate: AuthenticateApiClientUseCase) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedHttpRequest>();
    delete request.principal;
    const credential = readApiKeyCredential(request.headers);
    if (!credential.ok) throw new AuthenticationHttpException(credential.error);

    const result = await this.authenticate.execute({ apiKey: credential.value });
    if (!result.ok) throw new AuthenticationHttpException(result.error);

    request.principal = result.value;
    requestContext.setActor(result.value);
    return true;
  }
}
