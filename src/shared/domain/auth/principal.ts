/** Populated by an authentication adapter: JWT and API keys share this contract. */
export type PrincipalType = 'HUMAN' | 'MACHINE';

export interface Principal<TAttributes extends object = Record<string, unknown>> {
  readonly id: string;
  readonly type: PrincipalType;
  readonly roles: readonly string[];
  readonly permissions: readonly string[];
  readonly attributes: Readonly<TAttributes>;
}
