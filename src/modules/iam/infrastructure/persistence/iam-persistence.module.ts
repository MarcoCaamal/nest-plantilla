import { Module } from '@nestjs/common';
import { RoleRepositoryPort } from '../../application/ports/role-repository.port';
import { PermissionRepositoryPort } from '../../application/ports/permission-repository.port';
import { PrismaRoleRepository } from './prisma-role.repository';
import { PrismaPermissionRepository } from './prisma-permission.repository';

@Module({
  providers: [
    PrismaRoleRepository, PrismaPermissionRepository,
    { provide: RoleRepositoryPort, useExisting: PrismaRoleRepository },
    { provide: PermissionRepositoryPort, useExisting: PrismaPermissionRepository },
  ],
  exports: [RoleRepositoryPort, PermissionRepositoryPort],
})
export class IamPersistenceModule {}
