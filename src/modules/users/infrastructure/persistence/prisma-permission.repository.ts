import { Injectable } from '@nestjs/common';
import { PrismaHost } from '@/shared/infrastructure/persistence/prisma-unit-of-work';
import {
  PermissionRepositoryPort, type PermissionInfo,
} from '../../domain/ports/permission-repository.port';

@Injectable()
export class PrismaPermissionRepository extends PermissionRepositoryPort {
  constructor(private readonly host: PrismaHost) { super(); }

  async list(): Promise<readonly PermissionInfo[]> {
    return this.host.client.permission.findMany({
      select: { id: true, key: true }, orderBy: { key: 'asc' },
    });
  }

  async findByKey(key: string): Promise<PermissionInfo | null> {
    return this.host.client.permission.findUnique({
      where: { key }, select: { id: true, key: true },
    });
  }
}
