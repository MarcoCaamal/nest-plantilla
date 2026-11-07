import { Module } from '@nestjs/common';
import { IdGeneratorPort } from '@/shared/application/ports/id-generator.port';
import { UnitOfWorkPort } from '@/shared/application/ports/unit-of-work.port';
import { RoleRepositoryPort } from './application/ports/role-repository.port';
import { PermissionRepositoryPort } from './application/ports/permission-repository.port';
import { CreateRoleUseCase } from './application/use-cases/create-role.use-case';
import { UpdateRoleUseCase } from './application/use-cases/update-role.use-case';
import { DeleteRoleUseCase } from './application/use-cases/delete-role.use-case';
import { ListRolesUseCase } from './application/use-cases/list-roles.use-case';
import { SetRolePermissionsUseCase } from './application/use-cases/set-role-permissions.use-case';
import { ListPermissionsUseCase } from './application/use-cases/list-permissions.use-case';
import { IamPersistenceModule } from './infrastructure/persistence/iam-persistence.module';
import { BackofficeRolesController } from './infrastructure/http/backoffice/backoffice-roles.controller';
import { BackofficePermissionsController } from './infrastructure/http/backoffice/backoffice-permissions.controller';

@Module({
  imports: [IamPersistenceModule],
  controllers: [BackofficeRolesController, BackofficePermissionsController],
  providers: [
    { provide: CreateRoleUseCase, useFactory: (roles: RoleRepositoryPort, ids: IdGeneratorPort, uow: UnitOfWorkPort) => new CreateRoleUseCase(roles, ids, uow), inject: [RoleRepositoryPort, IdGeneratorPort, UnitOfWorkPort] },
    { provide: UpdateRoleUseCase, useFactory: (roles: RoleRepositoryPort, uow: UnitOfWorkPort) => new UpdateRoleUseCase(roles, uow), inject: [RoleRepositoryPort, UnitOfWorkPort] },
    { provide: DeleteRoleUseCase, useFactory: (roles: RoleRepositoryPort, uow: UnitOfWorkPort) => new DeleteRoleUseCase(roles, uow), inject: [RoleRepositoryPort, UnitOfWorkPort] },
    { provide: ListRolesUseCase, useFactory: (roles: RoleRepositoryPort) => new ListRolesUseCase(roles), inject: [RoleRepositoryPort] },
    { provide: SetRolePermissionsUseCase, useFactory: (roles: RoleRepositoryPort, ids: IdGeneratorPort, uow: UnitOfWorkPort) => new SetRolePermissionsUseCase(roles, ids, uow), inject: [RoleRepositoryPort, IdGeneratorPort, UnitOfWorkPort] },
    { provide: ListPermissionsUseCase, useFactory: (permissions: PermissionRepositoryPort) => new ListPermissionsUseCase(permissions), inject: [PermissionRepositoryPort] },
  ],
})
export class IamModule {}
