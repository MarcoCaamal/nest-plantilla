/** Expected identity/authentication outcomes; no NestJS or HTTP types here. */
export type AuthDomainError =
  | { readonly type: 'INVALID_CREDENTIALS' }
  | { readonly type: 'IDENTITY_INACTIVE' }
  | { readonly type: 'EMAIL_TAKEN' }
  | { readonly type: 'REFRESH_INVALID' }
  | { readonly type: 'REFRESH_REUSED' }
  | { readonly type: 'TOKEN_INVALID' };
