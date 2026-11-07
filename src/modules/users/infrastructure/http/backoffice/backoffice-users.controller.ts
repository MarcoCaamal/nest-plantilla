import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { UserAuthenticationGuard } from '@/modules/auth/public';
import { GateGuard } from '@/shared/infrastructure/http/guards/gate.guard';
import { Authorize } from '@/shared/infrastructure/http/decorators/authorize.decorator';
import { CurrentPrincipal } from '@/shared/infrastructure/http/decorators/current-principal.decorator';
import type { UserPrincipal } from '@/shared/domain/auth/principal';
import { HttpResult } from '@/shared/infrastructure/http/http-result';
import { PaginationHttpMapper } from '@/shared/infrastructure/http/schemas/pagination-query.schema';
import { ListUsersUseCase } from '../../../application/use-cases/backoffice/list-users.use-case';
import { CreateUserUseCase } from '../../../application/use-cases/backoffice/create-user.use-case';
import { GetUserDetailUseCase } from '../../../application/use-cases/backoffice/get-user-detail.use-case';
import { ChangeUserStatusUseCase } from '../../../application/use-cases/backoffice/change-user-status.use-case';
import { AssignUserRolesUseCase } from '../../../application/use-cases/backoffice/assign-user-roles.use-case';
import { UsersErrorMapper } from './users-error.mapper';
import { UsersQueryDto, AssignRoleDto, CreateUserDto, ChangeUserStatusDto } from './schemas/users.schema';

@Controller('backoffice/users')
@UseGuards(UserAuthenticationGuard, GateGuard)
export class BackofficeUsersController {
  constructor(private readonly listUsers: ListUsersUseCase, private readonly createUser: CreateUserUseCase,
    private readonly detail: GetUserDetailUseCase, private readonly status: ChangeUserStatusUseCase,
    private readonly userRoles: AssignUserRolesUseCase) {}

  @Get()
  @Authorize('users:read')
  async list(@CurrentPrincipal() actor: UserPrincipal,
    @Query({ schema: UsersQueryDto.schema }) query: typeof UsersQueryDto.schema._output) {
    return HttpResult.from(await this.listUsers.execute(
      actor, query.email ? { email: query.email } : {}, PaginationHttpMapper.toPageQuery(query),
    ), UsersErrorMapper.toProblemDetails);
  }

  @Get(':id')
  @Authorize('users:read')
  async get(@CurrentPrincipal() actor: UserPrincipal, @Param('id') id: string) {
    return HttpResult.from(await this.detail.execute(actor, id), UsersErrorMapper.toProblemDetails);
  }

  @Post()
  @Authorize('users:write')
  async create(@CurrentPrincipal() actor: UserPrincipal,
    @Body({ schema: CreateUserDto.schema }) dto: typeof CreateUserDto.schema._output) {
    return HttpResult.from(await this.createUser.execute(actor, { email: dto.email, password: dto.password,
      ...(dto.displayName === undefined ? {} : { displayName: dto.displayName }),
    }), UsersErrorMapper.toProblemDetails, 201);
  }

  @Patch(':id/status')
  @Authorize('users:write')
  async changeStatus(@CurrentPrincipal() actor: UserPrincipal, @Param('id') id: string,
    @Body({ schema: ChangeUserStatusDto.schema }) dto: typeof ChangeUserStatusDto.schema._output) {
    return HttpResult.from(await this.status.execute(actor, id, dto.status), UsersErrorMapper.toProblemDetails);
  }

  @Post(':id/roles')
  @Authorize('users:write')
  async assignRole(@CurrentPrincipal() actor: UserPrincipal, @Param('id') id: string,
    @Body({ schema: AssignRoleDto.schema }) dto: typeof AssignRoleDto.schema._output) {
    return HttpResult.from(await this.userRoles.assign(actor, id, dto.roleKey), UsersErrorMapper.toProblemDetails);
  }

  @Delete(':id/roles/:roleKey')
  @Authorize('users:write')
  async removeRole(@CurrentPrincipal() actor: UserPrincipal, @Param('id') id: string, @Param('roleKey') roleKey: string) {
    return HttpResult.from(await this.userRoles.remove(actor, id, roleKey), UsersErrorMapper.toProblemDetails);
  }
}
