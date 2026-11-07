import { Injectable } from '@nestjs/common';
import { PrismaHost } from '@/shared/infrastructure/persistence/prisma-unit-of-work';
import { RoleRepositoryPort, type RoleInfo } from '../../domain/ports/role-repository.port';

@Injectable()
export class PrismaRoleRepository extends RoleRepositoryPort {
  constructor(private readonly host: PrismaHost) { super(); }

  async list(): Promise<readonly RoleInfo[]> {
    const roles = await this.host.client.role.findMany({
      include: { permissions: { include: { permission: true } } }, orderBy: { key: 'asc' },
    });
    return roles.map((role) => ({
      id: role.id, key: role.key, name: role.name, description: role.description,
      permissions: role.permissions.map((item) => item.permission.key),
    }));
  }

  async create(input: { id: string; key: string; name: string; description?: string }): Promise<void> {
    await this.host.client.role.create({ data: { ...input } });
  }

  async createPermission(id: string, key: string): Promise<void> {
    await this.host.client.permission.create({ data: { id, key } });
  }

  async grantPermission(roleKey: string, permissionKey: string, relationId: string): Promise<boolean> {
    const [role, permission] = await Promise.all([
      this.host.client.role.findUnique({ where: { key: roleKey } }),
      this.host.client.permission.findUnique({ where: { key: permissionKey } }),
    ]);
    if (!role || !permission) return false;
    await this.host.client.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
      create: { id: relationId, roleId: role.id, permissionId: permission.id }, update: {},
    });
    return true;
  }
}
