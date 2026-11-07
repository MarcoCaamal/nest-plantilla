import { Module } from '@nestjs/common';
import { UserRepositoryPort } from './application/ports/user-repository.port';
import { UserResourcePolicy } from './domain/policies/user-resource.policy';
import { ListUsersUseCase } from './application/use-cases/backoffice/list-users.use-case';
import { CreateUserUseCase } from './application/use-cases/backoffice/create-user.use-case';
import { GetUserDetailUseCase } from './application/use-cases/backoffice/get-user-detail.use-case';
import { ChangeUserStatusUseCase } from './application/use-cases/backoffice/change-user-status.use-case';
import { AssignUserRolesUseCase } from './application/use-cases/backoffice/assign-user-roles.use-case';
import { GetMyProfileUseCase } from './application/use-cases/self/get-my-profile.use-case';
import { UpdateMyProfileUseCase } from './application/use-cases/self/update-my-profile.use-case';
import { ChangeMyPasswordUseCase } from './application/use-cases/self/change-my-password.use-case';
import { PasswordHasherPort, SessionRepositoryPort } from '@/modules/auth/public';
import { ClockPort } from '@/shared/application/ports/clock.port';
import { IdGeneratorPort } from '@/shared/application/ports/id-generator.port';
import { UnitOfWorkPort } from '@/shared/application/ports/unit-of-work.port';
import { UsersPersistenceModule } from './infrastructure/persistence/users-persistence.module';
import { BackofficeUsersController } from './infrastructure/http/backoffice/backoffice-users.controller';
import { MeController } from './infrastructure/http/self/me.controller';

@Module({
  imports: [UsersPersistenceModule],
  controllers: [BackofficeUsersController, MeController],
  providers: [
    UserResourcePolicy,
    { provide: ListUsersUseCase, useFactory: (users: UserRepositoryPort, policy: UserResourcePolicy) => new ListUsersUseCase(users, policy), inject: [UserRepositoryPort, UserResourcePolicy] },
    { provide: GetMyProfileUseCase, useFactory: (users: UserRepositoryPort) => new GetMyProfileUseCase(users), inject: [UserRepositoryPort] },
    { provide: UpdateMyProfileUseCase, useFactory: (users: UserRepositoryPort, uow: UnitOfWorkPort) => new UpdateMyProfileUseCase(users, uow), inject: [UserRepositoryPort, UnitOfWorkPort] },
    { provide: ChangeMyPasswordUseCase, useFactory: (users: UserRepositoryPort, passwords: PasswordHasherPort, sessions: SessionRepositoryPort, clock: ClockPort, uow: UnitOfWorkPort) => new ChangeMyPasswordUseCase(users, passwords, sessions, clock, uow), inject: [UserRepositoryPort, PasswordHasherPort, SessionRepositoryPort, ClockPort, UnitOfWorkPort] },
    { provide: CreateUserUseCase, useFactory: (users: UserRepositoryPort, passwords: PasswordHasherPort, ids: IdGeneratorPort, clock: ClockPort, uow: UnitOfWorkPort) => new CreateUserUseCase(users, passwords, ids, clock, uow), inject: [UserRepositoryPort, PasswordHasherPort, IdGeneratorPort, ClockPort, UnitOfWorkPort] },
    { provide: GetUserDetailUseCase, useFactory: (users: UserRepositoryPort, policy: UserResourcePolicy) => new GetUserDetailUseCase(users, policy), inject: [UserRepositoryPort, UserResourcePolicy] },
    { provide: ChangeUserStatusUseCase, useFactory: (users: UserRepositoryPort, sessions: SessionRepositoryPort, policy: UserResourcePolicy, clock: ClockPort, uow: UnitOfWorkPort) => new ChangeUserStatusUseCase(users, sessions, policy, clock, uow), inject: [UserRepositoryPort, SessionRepositoryPort, UserResourcePolicy, ClockPort, UnitOfWorkPort] },
    { provide: AssignUserRolesUseCase, useFactory: (users: UserRepositoryPort, policy: UserResourcePolicy, ids: IdGeneratorPort, uow: UnitOfWorkPort) => new AssignUserRolesUseCase(users, policy, ids, uow), inject: [UserRepositoryPort, UserResourcePolicy, IdGeneratorPort, UnitOfWorkPort] },
  ],
  exports: [ListUsersUseCase, GetMyProfileUseCase],
})
export class UsersModule {}
