import { Injectable } from '@nestjs/common';
import type { Permission } from '../../domain/entities/permission.entity';
import { PrismaHost } from '@/shared/infrastructure/persistence/prisma-unit-of-work';
import {
  PermissionRepositoryPort,
} from '../../application/ports/permission-repository.port';

@Injectable()
export class PrismaPermissionRepository extends PermissionRepositoryPort {
  constructor(private readonly host: PrismaHost) { super(); }

  async list(): Promise<readonly Permission[]> {
    return this.host.client.permission.findMany({
      select: { id: true, key: true }, orderBy: { key: 'asc' },
    });
  }

  async findByKey(key: string): Promise<Permission | null> {
    return this.host.client.permission.findUnique({
      where: { key }, select: { id: true, key: true },
    });
  }
}
