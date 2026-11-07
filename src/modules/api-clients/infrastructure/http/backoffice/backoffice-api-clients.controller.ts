import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { UserAuthenticationGuard } from '@/modules/auth/public';
import { GateGuard } from '@/shared/infrastructure/http/guards/gate.guard';
import { Authorize } from '@/shared/infrastructure/http/decorators/authorize.decorator';
import { CurrentPrincipal } from '@/shared/infrastructure/http/decorators/current-principal.decorator';
import { HttpResult } from '@/shared/infrastructure/http/http-result';
import type { UserPrincipal } from '@/shared/domain/auth/principal';
import { CreateApiClientUseCase } from '../../../application/use-cases/create-api-client.use-case';
import { CreateApiClientDto } from './schemas/create-api-client.schema';

@Controller('backoffice/api-clients')
@UseGuards(UserAuthenticationGuard, GateGuard)
export class BackofficeApiClientsController {
  constructor(private readonly createClient: CreateApiClientUseCase) {}

  @Post()
  @Authorize('api-clients:write')
  async create(
    @CurrentPrincipal() actor: UserPrincipal,
    @Body({ schema: CreateApiClientDto.schema }) dto: typeof CreateApiClientDto.schema._output,
  ) {
    return HttpResult.from(await this.createClient.execute(actor, dto),
      () => ({ type: 'about:blank', title: 'Forbidden', status: 403 }), 201);
  }
}
