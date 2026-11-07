import { Global, Module } from '@nestjs/common';
import { UserRepositoryPort } from '../../domain/ports/user-repository.port';
import { RoleRepositoryPort } from '../../domain/ports/role-repository.port';
import { PrismaUserRepository } from './prisma-user.repository';
import { PrismaRoleRepository } from './prisma-role.repository';

@Global()
@Module({
  providers: [
    PrismaUserRepository, PrismaRoleRepository,
    { provide: UserRepositoryPort, useExisting: PrismaUserRepository },
    { provide: RoleRepositoryPort, useExisting: PrismaRoleRepository },
  ],
  exports: [UserRepositoryPort, RoleRepositoryPort],
})
export class UsersPersistenceModule {}
