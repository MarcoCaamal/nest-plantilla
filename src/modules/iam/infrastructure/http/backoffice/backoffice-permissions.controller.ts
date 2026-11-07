import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { UserAuthenticationGuard } from '@/modules/auth/public';
import { GateGuard } from '@/shared/infrastructure/http/guards/gate.guard';
import { Authorize } from '@/shared/infrastructure/http/decorators/authorize.decorator';
import { CurrentPrincipal } from '@/shared/infrastructure/http/decorators/current-principal.decorator';
import type { UserPrincipal } from '@/shared/domain/auth/principal';
import { HttpResult } from '@/shared/infrastructure/http/http-result';
import { ListPermissionsUseCase } from '../../../application/use-cases/list-permissions.use-case';
import { IamErrorMapper } from './iam-error.mapper';

/** Read-only permission catalog. No route mutates permission records. */
@Controller('backoffice/permissions')
@UseGuards(UserAuthenticationGuard, GateGuard)
export class BackofficePermissionsController {
  constructor(private readonly listPermissions: ListPermissionsUseCase) {}

  @Get()
  @Authorize('permissions:read')
  async list(@CurrentPrincipal() actor: UserPrincipal) {
    return HttpResult.from(await this.listPermissions.execute(actor), IamErrorMapper.toProblemDetails);
  }

  @Get(':key')
  @Authorize('permissions:read')
  async get(@CurrentPrincipal() actor: UserPrincipal, @Param('key') key: string) {
    return HttpResult.from(await this.listPermissions.get(actor, key), IamErrorMapper.toProblemDetails);
  }
}
