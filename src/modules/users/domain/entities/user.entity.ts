export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'PENDING_VERIFICATION';

/** Generic identity; administrative access is granted through roles, not a user subtype. */
export interface User {
  readonly id: string;
  readonly email: string;
  readonly displayName: string | null;
  readonly passwordHash: string;
  readonly status: UserStatus;
  readonly emailVerifiedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly roles: readonly string[];
  readonly permissions: readonly string[];
}

/** Explicitly excludes credential hashes at the application boundary. */
export type SafeUser = Omit<User, 'passwordHash'>;
