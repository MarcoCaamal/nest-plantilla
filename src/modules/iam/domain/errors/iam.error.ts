export type IamError =
  | { readonly type: 'FORBIDDEN' }
  | { readonly type: 'NOT_FOUND' }
  | { readonly type: 'CONFLICT' }
  | { readonly type: 'PROTECTED_ROLE' };
