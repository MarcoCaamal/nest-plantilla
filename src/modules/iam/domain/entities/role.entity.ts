/** RBAC catalog record; the stable key is immutable after creation. */
export interface Role {
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
