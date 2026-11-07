/** Permissions are a predefined catalog; application code exposes read access only. */
export interface PermissionInfo {
  readonly id: string;
  readonly key: string;
}

export abstract class PermissionRepositoryPort {
  abstract list(): Promise<readonly PermissionInfo[]>;
  abstract findByKey(key: string): Promise<PermissionInfo | null>;
}
