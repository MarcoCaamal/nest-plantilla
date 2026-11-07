export type AuthorizationError =
  | {
      readonly type: 'PERMISSION_DENIED';
      readonly permission: string;
    }
  | {
      readonly type: 'FORBIDDEN_RESOURCE_ACTION';
      readonly action: string;
      readonly resourceName: string;
    }
  | {
      readonly type: 'ACCESS_SCOPE_DENIED';
      readonly resourceName: string;
    };
