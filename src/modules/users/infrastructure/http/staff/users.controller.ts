import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { UserAuthenticationGuard } from '@/modules/auth/public';
import { GateGuard } from '@/shared/infrastructure/http/guards/gate.guard';
import { Authorize } from '@/shared/infrastructure/http/decorators/authorize.decorator';
import { CurrentPrincipal } from '@/shared/infrastructure/http/decorators/current-principal.decorator';
import type { UserPrincipal } from '@/shared/domain/auth/principal';
import { HttpResult } from '@/shared/infrastructure/http/http-result';
import { PaginationHttpMapper } from '@/shared/infrastructure/http/schemas/pagination-query.schema';
import { ListUsersUseCase } from '../../../application/use-cases/list-users.use-case';
import { ManageRbacUseCase } from '../../../application/use-cases/manage-rbac.use-case';
import { ReadRbacUseCase } from '../../../application/use-cases/read-rbac.use-case';
import { UsersErrorMapper } from './users-error.mapper';
import {
  UsersQueryDto, AssignRoleDto, CreateRoleDto, UpdateRoleDto, GrantPermissionDto,
} from './schemas/users.schema';

/** The staff prefix is an HTTP audience only: every principal remains a generic User. */
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

  @Delete(':id/roles/:roleKey')
  @Authorize('users:write')
  async removeRole(
    @CurrentPrincipal() actor: UserPrincipal,
    @Param('id') id: string,
    @Param('roleKey') roleKey: string,
  ) {
    return HttpResult.from(await this.manage.removeRole(actor, id, roleKey), UsersErrorMapper.toProblemDetails);
  }
}

@Controller('staff/roles')
@UseGuards(UserAuthenticationGuard, GateGuard)
export class StaffRolesController {
  constructor(
    private readonly read: ReadRbacUseCase,
    private readonly manage: ManageRbacUseCase,
  ) {}

  @Get()
  @Authorize('roles:read')
  async list(@CurrentPrincipal() actor: UserPrincipal) {
    return HttpResult.from(await this.read.listRoles(actor), UsersErrorMapper.toProblemDetails);
  }

  @Get(':key')
  @Authorize('roles:read')
  async get(@CurrentPrincipal() actor: UserPrincipal, @Param('key') key: string) {
    return HttpResult.from(await this.read.getRole(actor, key), UsersErrorMapper.toProblemDetails);
  }

  @Post()
  @Authorize('roles:write')
  async create(
    @CurrentPrincipal() actor: UserPrincipal,
    @Body({ schema: CreateRoleDto.schema }) dto: typeof CreateRoleDto.schema._output,
  ) {
    return HttpResult.from(await this.manage.createRole(
      actor, dto.key, dto.name, dto.description,
    ), UsersErrorMapper.toProblemDetails, 201);
  }

  @Patch(':key')
  @Authorize('roles:write')
  async update(
    @CurrentPrincipal() actor: UserPrincipal,
    @Param('key') key: string,
    @Body({ schema: UpdateRoleDto.schema }) dto: typeof UpdateRoleDto.schema._output,
  ) {
    return HttpResult.from(await this.manage.updateRole(actor, key, {
      ...(dto.name === undefined ? {} : { name: dto.name }),
      ...(dto.description === undefined ? {} : { description: dto.description }),
    }), UsersErrorMapper.toProblemDetails);
  }

  @Delete(':key')
  @Authorize('roles:write')
  async delete(@CurrentPrincipal() actor: UserPrincipal, @Param('key') key: string) {
    return HttpResult.from(await this.manage.deleteRole(actor, key), UsersErrorMapper.toProblemDetails);
  }

  @Post(':key/permissions')
  @Authorize('roles:write')
  async grant(
    @CurrentPrincipal() actor: UserPrincipal,
    @Param('key') key: string,
    @Body({ schema: GrantPermissionDto.schema }) dto: typeof GrantPermissionDto.schema._output,
  ) {
    return HttpResult.from(await this.manage.grantPermission(
      actor, key, dto.permissionKey,
    ), UsersErrorMapper.toProblemDetails);
  }

  @Delete(':key/permissions/:permissionKey')
  @Authorize('roles:write')
  async revoke(
    @CurrentPrincipal() actor: UserPrincipal,
    @Param('key') key: string,
    @Param('permissionKey') permissionKey: string,
  ) {
    return HttpResult.from(await this.manage.revokePermission(
      actor, key, permissionKey,
    ), UsersErrorMapper.toProblemDetails);
  }
}

/** Immutable, code-seeded permission catalog: deliberately no write endpoints. */
@Controller('staff/permissions')
@UseGuards(UserAuthenticationGuard, GateGuard)
export class StaffPermissionsController {
  constructor(private readonly read: ReadRbacUseCase) {}

  @Get()
  @Authorize('permissions:read')
  async list(@CurrentPrincipal() actor: UserPrincipal) {
    return HttpResult.from(await this.read.listPermissions(actor), UsersErrorMapper.toProblemDetails);
  }

  @Get(':key')
  @Authorize('permissions:read')
  async get(@CurrentPrincipal() actor: UserPrincipal, @Param('key') key: string) {
    return HttpResult.from(await this.read.getPermission(actor, key), UsersErrorMapper.toProblemDetails);
  }
}
