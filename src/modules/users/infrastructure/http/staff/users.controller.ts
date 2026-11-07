import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { UserAuthenticationGuard } from '@/modules/auth/public';
import { GateGuard } from '@/shared/infrastructure/http/guards/gate.guard';
import { Authorize } from '@/shared/infrastructure/http/decorators/authorize.decorator';
import { CurrentPrincipal } from '@/shared/infrastructure/http/decorators/current-principal.decorator';
import type { UserPrincipal } from '@/shared/domain/auth/principal';
import { HttpResult } from '@/shared/infrastructure/http/http-result';
import { PaginationHttpMapper } from '@/shared/infrastructure/http/schemas/pagination-query.schema';
import { ListUsersUseCase } from '../../../application/use-cases/list-users.use-case';
import { ManageRbacUseCase } from '../../../application/use-cases/manage-rbac.use-case';
import { UsersErrorMapper } from './users-error.mapper';
import { UsersQueryDto, AssignRoleDto, CreateRoleDto, CreatePermissionDto, GrantPermissionDto } from './schemas/users.schema';

@Controller('staff/users')
@UseGuards(UserAuthenticationGuard, GateGuard)
export class StaffUsersController {
  constructor(
    private readonly listUsers: ListUsersUseCase,
    private readonly manage: ManageRbacUseCase,
  ) {}

  @Get()
  @Authorize('users:read')
  async list(
    @CurrentPrincipal() actor: UserPrincipal,
    @Query({ schema: UsersQueryDto.schema }) query: typeof UsersQueryDto.schema._output,
  ) {
    return HttpResult.from(await this.listUsers.execute(
      actor, query.email ? { email: query.email } : {}, PaginationHttpMapper.toPageQuery(query),
    ), UsersErrorMapper.toProblemDetails);
  }

  @Post(':id/roles')
  @Authorize('users:write')
  async assignRole(
    @CurrentPrincipal() actor: UserPrincipal,
    @Param('id') id: string,
    @Body({ schema: AssignRoleDto.schema }) dto: typeof AssignRoleDto.schema._output,
  ) {
    return HttpResult.from(await this.manage.assignRole(actor, id, dto.roleKey), UsersErrorMapper.toProblemDetails);
  }
}

@Controller('staff/roles')
@UseGuards(UserAuthenticationGuard, GateGuard)
export class StaffRolesController {
  constructor(private readonly manage: ManageRbacUseCase) {}

  @Get()
  @Authorize('users:read')
  async list(@CurrentPrincipal() actor: UserPrincipal) {
    return HttpResult.from(await this.manage.rolesFor(actor), UsersErrorMapper.toProblemDetails);
  }

  @Post()
  @Authorize('users:write')
  async create(
    @CurrentPrincipal() actor: UserPrincipal,
    @Body({ schema: CreateRoleDto.schema }) dto: typeof CreateRoleDto.schema._output,
  ) {
    return HttpResult.from(await this.manage.createRole(
      actor, dto.key, dto.name, dto.description,
    ), UsersErrorMapper.toProblemDetails, 201);
  }

  @Post(':key/permissions')
  @Authorize('users:write')
  async grant(
    @CurrentPrincipal() actor: UserPrincipal,
    @Param('key') key: string,
    @Body({ schema: GrantPermissionDto.schema }) dto: typeof GrantPermissionDto.schema._output,
  ) {
    return HttpResult.from(await this.manage.grantPermission(
      actor, key, dto.permissionKey,
    ), UsersErrorMapper.toProblemDetails);
  }
}

@Controller('staff/permissions')
@UseGuards(UserAuthenticationGuard, GateGuard)
export class StaffPermissionsController {
  constructor(private readonly manage: ManageRbacUseCase) {}

  @Post()
  @Authorize('users:write')
  async create(
    @CurrentPrincipal() actor: UserPrincipal,
    @Body({ schema: CreatePermissionDto.schema }) dto: typeof CreatePermissionDto.schema._output,
  ) {
    return HttpResult.from(await this.manage.createPermission(
      actor, dto.key,
    ), UsersErrorMapper.toProblemDetails, 201);
  }
}
