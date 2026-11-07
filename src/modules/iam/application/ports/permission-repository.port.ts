import type { Permission } from '../../domain/entities/permission.entity';

export abstract class PermissionRepositoryPort {
  abstract list(): Promise<readonly Permission[]>;
  abstract findByKey(key: string): Promise<Permission | null>;
}
