/** Trusted authentication adapters produce this provider-independent identity. */
export type PrincipalType = 'HUMAN' | 'MACHINE';

export type DeepReadonly<T> =
  T extends (...args: never[]) => unknown ? T
    : T extends readonly (infer U)[] ? readonly DeepReadonly<U>[]
      : T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
        : T;

export interface Principal<TAttributes extends object = Record<string, unknown>> {
  readonly id: string;
  readonly type: PrincipalType;
  readonly roles: readonly string[];
  readonly permissions: readonly string[];
  readonly attributes: DeepReadonly<TAttributes>;
}

export type HumanPrincipal<TAttributes extends object = Record<string, unknown>> =
  Principal<TAttributes> & { readonly type: 'HUMAN' };

export type MachinePrincipal<TAttributes extends object = Record<string, unknown>> =
  Principal<TAttributes> & { readonly type: 'MACHINE' };

/**
 * Defensive snapshot of a trusted principal. Claims must be JSON-like, validated
 * records (no Date, Map, functions or cycles), never live ORM/SDK objects.
 * Clones nested values so mutations to a verifier's source cannot change policies.
 */
function freezeClaims(value: unknown): unknown {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeClaims));
  if (value !== null && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(
      Object.entries(value).map(([key, claim]) => [key, freezeClaims(claim)]),
    ));
  }
  return value;
}

export function snapshotPrincipal<
  TAttributes extends object,
  TType extends PrincipalType,
>(principal: Principal<TAttributes> & { readonly type: TType }): Principal<TAttributes> & { readonly type: TType } {
  return Object.freeze({
    id: principal.id,
    type: principal.type,
    roles: Object.freeze([...principal.roles]),
    permissions: Object.freeze([...principal.permissions]),
    attributes: freezeClaims(principal.attributes) as DeepReadonly<TAttributes>,
  });
}
