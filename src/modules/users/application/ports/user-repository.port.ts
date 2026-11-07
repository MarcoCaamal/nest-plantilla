import type { PageQuery, PageResult } from '@/shared/core/pagination';
import type { ScopedListQuery } from '@/shared/domain/auth/scoped-list-query';
import type { User, UserStatus, SafeUser } from '../../domain/entities/user.entity';

import type { UserScopeConstraints } from '../../domain/entities/user-scope';
export type { UserScopeConstraints } from '../../domain/entities/user-scope';
export interface UserFilters { readonly email?: string }

export abstract class UserRepositoryPort {
  abstract findByEmail(email: string): Promise<User | null>;
  abstract findById(id: string): Promise<User | null>;
  abstract create(user: Pick<User, 'id' | 'email' | 'passwordHash' | 'status' | 'emailVerifiedAt'> & { displayName?: string | null }): Promise<void>;
  abstract updateProfile(id: string, displayName: string | null): Promise<void>;
  abstract updatePassword(id: string, passwordHash: string): Promise<void>;
  abstract updateStatus(id: string, status: UserStatus): Promise<void>;
  abstract verifyEmail(id: string, now: Date): Promise<void>;
  abstract list(query: ScopedListQuery<UserScopeConstraints, UserFilters, PageQuery>): Promise<PageResult<SafeUser>>;
  abstract assignRole(userId: string, roleKey: string, id: string): Promise<boolean>;
  abstract removeRole(userId: string, roleKey: string): Promise<'REMOVED' | 'NOT_FOUND' | 'LAST_ADMIN'>;
}
