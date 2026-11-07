/** Roles are configurable; permission keys are provisioned by code/seed, not HTTP. */
export interface RoleInfo {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly description: string | null;
  readonly permissions: readonly string[];
}

export interface RoleChanges {
  readonly name?: string;
  readonly description?: string | null;
}

export abstract class RoleRepositoryPort {
  abstract list(): Promise<readonly RoleInfo[]>;
  abstract findByKey(key: string): Promise<RoleInfo | null>;
  /** Returns false when the unique key is already taken. */
  abstract create(role: { id: string; key: string; name: string; description?: string }): Promise<boolean>;
  /** Returns false for unknown role keys. */
  abstract update(key: string, changes: RoleChanges): Promise<boolean>;
  /** Returns false for unknown role keys. Memberships are removed by FK cascade. */
  abstract delete(key: string): Promise<boolean>;
  /** Returns false when either referenced key does not exist. */
  abstract grantPermission(roleKey: string, permissionKey: string, relationId: string): Promise<boolean>;
  /** Returns false for unknown role or permission keys. Existing missing links are idempotent. */
  abstract revokePermission(roleKey: string, permissionKey: string): Promise<boolean>;
}
