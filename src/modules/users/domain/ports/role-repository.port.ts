export interface RoleInfo {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly description: string | null;
  readonly permissions: readonly string[];
}

export abstract class RoleRepositoryPort {
  abstract list(): Promise<readonly RoleInfo[]>;
  abstract create(role: { id: string; key: string; name: string; description?: string }): Promise<void>;
  abstract createPermission(id: string, key: string): Promise<void>;
  abstract grantPermission(roleKey: string, permissionKey: string, relationId: string): Promise<boolean>;
}
