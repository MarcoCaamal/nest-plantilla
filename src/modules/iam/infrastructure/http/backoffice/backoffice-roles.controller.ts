import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { UserAuthenticationGuard } from '@/modules/auth/public';
import { GateGuard } from '@/shared/infrastructure/http/guards/gate.guard';
import { Authorize } from '@/shared/infrastructure/http/decorators/authorize.decorator';
import { CurrentPrincipal } from '@/shared/infrastructure/http/decorators/current-principal.decorator';
import type { UserPrincipal } from '@/shared/domain/auth/principal';
import { HttpResult } from '@/shared/infrastructure/http/http-result';
import { CreateRoleUseCase } from '../../../application/use-cases/create-role.use-case';
import { UpdateRoleUseCase } from '../../../application/use-cases/update-role.use-case';
import { DeleteRoleUseCase } from '../../../application/use-cases/delete-role.use-case';
import { ListRolesUseCase } from '../../../application/use-cases/list-roles.use-case';
import { SetRolePermissionsUseCase } from '../../../application/use-cases/set-role-permissions.use-case';
import { IamErrorMapper } from './iam-error.mapper';
import { CreateRoleDto, UpdateRoleDto, GrantPermissionDto } from './schemas/roles.schema';

@Controller('backoffice/roles')
@UseGuards(UserAuthenticationGuard, GateGuard)
export class BackofficeRolesController {
  constructor(
    private readonly listRoles: ListRolesUseCase,
    private readonly createRole: CreateRoleUseCase,
    private readonly updateRole: UpdateRoleUseCase,
    private readonly deleteRole: DeleteRoleUseCase,
    private readonly setPermissions: SetRolePermissionsUseCase,
  ) {}

  @Get()
  @Authorize('roles:read')
  async list(@CurrentPrincipal() actor: UserPrincipal) {
    return HttpResult.from(await this.listRoles.execute(actor), IamErrorMapper.toProblemDetails);
  }

  @Get(':key')
  @Authorize('roles:read')
  async get(@CurrentPrincipal() actor: UserPrincipal, @Param('key') key: string) {
    return HttpResult.from(await this.listRoles.get(actor, key), IamErrorMapper.toProblemDetails);
  }

  @Post()
  @Authorize('roles:write')
  async create(@CurrentPrincipal() actor: UserPrincipal,
    @Body({ schema: CreateRoleDto.schema }) dto: typeof CreateRoleDto.schema._output) {
    return HttpResult.from(await this.createRole.execute(actor, dto.key, dto.name, dto.description),
      IamErrorMapper.toProblemDetails, 201);
  }

  @Patch(':key')
  @Authorize('roles:write')
  async update(@CurrentPrincipal() actor: UserPrincipal, @Param('key') key: string,
    @Body({ schema: UpdateRoleDto.schema }) dto: typeof UpdateRoleDto.schema._output) {
    return HttpResult.from(await this.updateRole.execute(actor, key, {
      ...(dto.name === undefined ? {} : { name: dto.name }),
      ...(dto.description === undefined ? {} : { description: dto.description }),
    }), IamErrorMapper.toProblemDetails);
  }

  @Delete(':key')
  @Authorize('roles:write')
  async delete(@CurrentPrincipal() actor: UserPrincipal, @Param('key') key: string) {
    return HttpResult.from(await this.deleteRole.execute(actor, key), IamErrorMapper.toProblemDetails);
  }

  @Post(':key/permissions')
  @Authorize('roles:write')
  async grant(@CurrentPrincipal() actor: UserPrincipal, @Param('key') key: string,
    @Body({ schema: GrantPermissionDto.schema }) dto: typeof GrantPermissionDto.schema._output) {
    return HttpResult.from(await this.setPermissions.grant(actor, key, dto.permissionKey), IamErrorMapper.toProblemDetails);
  }

  @Delete(':key/permissions/:permissionKey')
  @Authorize('roles:write')
  async revoke(@CurrentPrincipal() actor: UserPrincipal, @Param('key') key: string, @Param('permissionKey') permissionKey: string) {
    return HttpResult.from(await this.setPermissions.revoke(actor, key, permissionKey), IamErrorMapper.toProblemDetails);
  }
}
