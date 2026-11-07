/** Authentication failures are expected values. No token/provider details leak into domain. */
export type AuthenticationError =
  | { readonly type: 'CREDENTIALS_MISSING' }
  | { readonly type: 'CREDENTIALS_INVALID' }
  | { readonly type: 'CREDENTIALS_EXPIRED' }
  | { readonly type: 'IDENTITY_INACTIVE' };
