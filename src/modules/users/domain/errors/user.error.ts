export type UserError =
  | { readonly type: 'FORBIDDEN' }
  | { readonly type: 'NOT_FOUND' }
  | { readonly type: 'CONFLICT' }
  | { readonly type: 'PROTECTED_USER' }
  | { readonly type: 'INVALID_PASSWORD' };
