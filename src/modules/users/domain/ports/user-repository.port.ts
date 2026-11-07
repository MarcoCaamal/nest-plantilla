import type { PageQuery, PageResult } from '@/shared/core/pagination';
import type { ScopedListQuery } from '@/shared/domain/auth/scoped-list-query';
import type { User, UserStatus } from '../entities/user';

export interface UserScopeConstraints { readonly allowedUserIds: readonly string[] }
export interface UserFilters { readonly email?: string }

export abstract class UserRepositoryPort {
  abstract findByEmail(email: string): Promise<User | null>;
  abstract findById(id: string): Promise<User | null>;
  abstract create(user: Pick<User, 'id' | 'email' | 'passwordHash' | 'status' | 'emailVerifiedAt'>): Promise<void>;
  abstract updatePassword(id: string, passwordHash: string): Promise<void>;
  abstract updateStatus(id: string, status: UserStatus): Promise<void>;
  abstract verifyEmail(id: string, now: Date): Promise<void>;
  abstract list(query: ScopedListQuery<UserScopeConstraints, UserFilters, PageQuery>): Promise<PageResult<Omit<User, 'passwordHash'>>>;
  abstract assignRole(userId: string, roleKey: string, id: string): Promise<boolean>;
  abstract removeRole(userId: string, roleKey: string): Promise<'REMOVED' | 'NOT_FOUND' | 'LAST_ADMIN'>;
}
