/** Denial is Result.err; an empty constraint must never mean unrestricted. */
export type AccessScope<TConstraints> =
  | { readonly kind: 'UNRESTRICTED' }
  | { readonly kind: 'CONSTRAINED'; readonly constraints: Readonly<TConstraints> };

export const AccessScope = {
  unrestricted: <TConstraints>(): AccessScope<TConstraints> => ({
    kind: 'UNRESTRICTED',
  }),
  constrained: <TConstraints>(
    constraints: Readonly<TConstraints>,
  ): AccessScope<TConstraints> => ({ kind: 'CONSTRAINED', constraints }),
};
