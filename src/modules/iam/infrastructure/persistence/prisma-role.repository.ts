import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Role, RoleChanges } from '../../domain/entities/role.entity';
import { PrismaHost } from '@/shared/infrastructure/persistence/prisma-unit-of-work';
import {
  RoleRepositoryPort,
} from '../../application/ports/role-repository.port';

@Injectable()
export class PrismaRoleRepository extends RoleRepositoryPort {
  constructor(private readonly host: PrismaHost) { super(); }

  private static toInfo(role: {
    id: string; key: string; name: string; description: string | null;
    permissions: { permission: { key: string } }[];
  }): Role {
    return {
      id: role.id,
      key: role.key,
      name: role.name,
      description: role.description,
      permissions: role.permissions.map((entry) => entry.permission.key).sort(),
    };
  }

  async list(): Promise<readonly Role[]> {
    const roles = await this.host.client.role.findMany({
      include: { permissions: { include: { permission: true } } },
      orderBy: { key: 'asc' },
    });
    return roles.map(PrismaRoleRepository.toInfo);
  }

  async findByKey(key: string): Promise<Role | null> {
    const role = await this.host.client.role.findUnique({
      where: { key }, include: { permissions: { include: { permission: true } } },
    });
    return role ? PrismaRoleRepository.toInfo(role) : null;
  }

  async create(input: { id: string; key: string; name: string; description?: string }): Promise<boolean> {
    try {
      await this.host.client.role.create({ data: { ...input } });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return false;
      throw error;
    }
  }

  async update(key: string, changes: RoleChanges): Promise<boolean> {
    const result = await this.host.client.role.updateMany({ where: { key }, data: { ...changes } });
    return result.count > 0;
  }

  async delete(key: string): Promise<boolean> {
    const result = await this.host.client.role.deleteMany({ where: { key } });
    return result.count > 0;
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

  async revokePermission(roleKey: string, permissionKey: string): Promise<boolean> {
    const [role, permission] = await Promise.all([
      this.host.client.role.findUnique({ where: { key: roleKey } }),
      this.host.client.permission.findUnique({ where: { key: permissionKey } }),
    ]);
    if (!role || !permission) return false;
    await this.host.client.rolePermission.deleteMany({
      where: { roleId: role.id, permissionId: permission.id },
    });
    return true;
  }
}
