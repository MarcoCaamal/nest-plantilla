/** The permission catalog is provisioned by migrations/seed, never by HTTP. */
export interface Permission {
  readonly id: string;
  readonly key: string;
}
