import type { Role, RoleChanges } from '../../domain/entities/role.entity';

/** Role writes and assignments are separate from the read-only permission catalog. */
export abstract class RoleRepositoryPort {
  abstract list(): Promise<readonly Role[]>;
  abstract findByKey(key: string): Promise<Role | null>;
  abstract create(role: { id: string; key: string; name: string; description?: string }): Promise<boolean>;
  abstract update(key: string, changes: RoleChanges): Promise<boolean>;
  abstract delete(key: string): Promise<boolean>;
  abstract grantPermission(roleKey: string, permissionKey: string, relationId: string): Promise<boolean>;
  abstract revokePermission(roleKey: string, permissionKey: string): Promise<boolean>;
}
