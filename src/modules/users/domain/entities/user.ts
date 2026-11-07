export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'PENDING_VERIFICATION';

/** Pure aggregate snapshot. Credentials are stored hashed, never logged. */
export interface User {
  readonly id: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly status: UserStatus;
  readonly emailVerifiedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly roles: readonly string[];
  readonly permissions: readonly string[];
}
