import { Global, Module } from '@nestjs/common';
import { UserRepositoryPort } from '../../domain/ports/user-repository.port';
import { RoleRepositoryPort } from '../../domain/ports/role-repository.port';
import { PrismaUserRepository } from './prisma-user.repository';
import { PrismaRoleRepository } from './prisma-role.repository';
import { PermissionRepositoryPort } from '../../domain/ports/permission-repository.port';
import { PrismaPermissionRepository } from './prisma-permission.repository';

@Global()
@Module({
  providers: [
    PrismaUserRepository, PrismaRoleRepository, PrismaPermissionRepository,
    { provide: UserRepositoryPort, useExisting: PrismaUserRepository },
    { provide: RoleRepositoryPort, useExisting: PrismaRoleRepository },
    { provide: PermissionRepositoryPort, useExisting: PrismaPermissionRepository },
  ],
  exports: [UserRepositoryPort, RoleRepositoryPort, PermissionRepositoryPort],
})
export class UsersPersistenceModule {}
