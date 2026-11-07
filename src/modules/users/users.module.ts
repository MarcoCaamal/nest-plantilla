import { Module } from '@nestjs/common';
import { UserRepositoryPort } from './domain/ports/user-repository.port';
import { RoleRepositoryPort } from './domain/ports/role-repository.port';
import { UsersPolicy } from './domain/policies/users.policy';
import { ListUsersUseCase } from './application/use-cases/list-users.use-case';
import { ManageRbacUseCase } from './application/use-cases/manage-rbac.use-case';
import { IdGeneratorPort } from '@/shared/application/ports/id-generator.port';
import { UnitOfWorkPort } from '@/shared/application/ports/unit-of-work.port';
import { UsersPersistenceModule } from './infrastructure/persistence/users-persistence.module';
import {
  StaffUsersController, StaffRolesController, StaffPermissionsController,
} from './infrastructure/http/staff/users.controller';

@Module({
  imports: [UsersPersistenceModule],
  controllers: [StaffUsersController, StaffRolesController, StaffPermissionsController],
  providers: [
    UsersPolicy,
    {
      provide: ListUsersUseCase,
      useFactory: (users: UserRepositoryPort, policy: UsersPolicy) => new ListUsersUseCase(users, policy),
      inject: [UserRepositoryPort, UsersPolicy],
    },
    {
      provide: ManageRbacUseCase,
      useFactory: (
        users: UserRepositoryPort, roles: RoleRepositoryPort, policy: UsersPolicy,
        ids: IdGeneratorPort, uow: UnitOfWorkPort,
      ) => new ManageRbacUseCase(users, roles, policy, ids, uow),
      inject: [UserRepositoryPort, RoleRepositoryPort, UsersPolicy, IdGeneratorPort, UnitOfWorkPort],
    },
  ],
  exports: [ListUsersUseCase, ManageRbacUseCase],
})
export class UsersModule {}
