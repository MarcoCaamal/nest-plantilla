import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UserRepositoryPort, type UserScopeConstraints, type UserFilters } from '../../application/ports/user-repository.port';
import type { User, UserStatus, SafeUser } from '../../domain/entities/user.entity';
import type { ScopedListQuery } from '@/shared/domain/auth/scoped-list-query';
import type { PageQuery, PageResult } from '@/shared/core/pagination';
import { scopedPrismaWhere } from '@/shared/infrastructure/persistence/scoped-prisma-where';
import { PrismaHost } from '@/shared/infrastructure/persistence/prisma-unit-of-work';

const withRoles = {
  roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
} satisfies Prisma.UserInclude;

type DbUserWithRoles = Prisma.UserGetPayload<{ include: typeof withRoles }>;

export class UserPrismaMapper {
  static toDomain(user: DbUserWithRoles): User {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      passwordHash: user.passwordHash,
      status: user.status,
      emailVerifiedAt: user.emailVerifiedAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      roles: user.roles.map(({ role }) => role.key),
      permissions: [...new Set(user.roles.flatMap(({ role }) =>
        role.permissions.map(({ permission }) => permission.key)))],
    };
  }
}

@Injectable()
export class PrismaUserRepository extends UserRepositoryPort {
  constructor(private readonly host: PrismaHost) { super(); }

  async findByEmail(email: string): Promise<User | null> {
    const found = await this.host.client.user.findUnique({ where: { email }, include: withRoles });
    return found ? UserPrismaMapper.toDomain(found) : null;
  }

  async findById(id: string): Promise<User | null> {
    const found = await this.host.client.user.findUnique({ where: { id }, include: withRoles });
    return found ? UserPrismaMapper.toDomain(found) : null;
  }

  async create(input: Pick<User, 'id' | 'email' | 'passwordHash' | 'status' | 'emailVerifiedAt'> & { displayName?: string | null }): Promise<void> {
    await this.host.client.user.create({ data: { ...input } });
  }

  async updateProfile(id: string, displayName: string | null): Promise<void> {
    await this.host.client.user.update({ where: { id }, data: { displayName } });
  }

  async updatePassword(id: string, passwordHash: string): Promise<void> {
    await this.host.client.user.update({ where: { id }, data: { passwordHash } });
  }

  async updateStatus(id: string, status: UserStatus): Promise<void> {
    await this.host.client.user.update({ where: { id }, data: { status } });
  }

  async verifyEmail(id: string, now: Date): Promise<void> {
    await this.host.client.user.update({ where: { id }, data: { emailVerifiedAt: now, status: 'ACTIVE' } });
  }

  async list(query: ScopedListQuery<UserScopeConstraints, UserFilters, PageQuery>): Promise<PageResult<SafeUser>> {
    const scopeWhere: Prisma.UserWhereInput = query.scope.kind === 'CONSTRAINED'
      ? { id: { in: [...query.scope.constraints.allowedUserIds] } } : {};
    const filterWhere: Prisma.UserWhereInput = query.filters.email
      ? { email: { contains: query.filters.email.toLowerCase(), mode: 'insensitive' } } : {};
    const where = scopedPrismaWhere(
      query.scope.kind === 'UNRESTRICTED'
        ? { kind: 'UNRESTRICTED' as const }
        : { kind: 'CONSTRAINED' as const, constraints: scopeWhere },
      filterWhere,
    );
    const { page, limit } = query.pagination;
    const [total, rows] = await Promise.all([
      this.host.client.user.count({ where }),
      this.host.client.user.findMany({
        where, include: withRoles, skip: (page - 1) * limit, take: limit, orderBy: { id: 'asc' },
      }),
    ]);
    return {
      kind: 'page', page, limit, total, totalPages: Math.ceil(total / limit),
      items: rows.map((row) => {
        const { passwordHash: _excluded, ...safe } = UserPrismaMapper.toDomain(row);
        void _excluded;
        return safe;
      }),
    };
  }

  async assignRole(userId: string, roleKey: string, id: string): Promise<boolean> {
    const role = await this.host.client.role.findUnique({ where: { key: roleKey } });
    const user = await this.host.client.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!role || !user) return false;
    await this.host.client.userRole.upsert({
      where: { userId_roleId: { userId, roleId: role.id } },
      create: { id, userId, roleId: role.id }, update: {},
    });
    return true;
  }

  async removeRole(userId: string, roleKey: string): Promise<'REMOVED' | 'NOT_FOUND' | 'LAST_ADMIN'> {
    const role = await this.host.client.role.findUnique({ where: { key: roleKey } });
    if (!role) return 'NOT_FOUND';
    const link = await this.host.client.userRole.findUnique({
      where: { userId_roleId: { userId, roleId: role.id } },
    });
    if (!link) return 'NOT_FOUND';

    if (roleKey === 'admin') {
      // Serialize concurrent admin removals on the role row. This method is
      // invoked inside UnitOfWorkPort.runInTransaction by the application.
      await this.host.client.$queryRaw`SELECT id FROM roles WHERE key = 'admin' FOR UPDATE`;
      const adminCount = await this.host.client.userRole.count({ where: { roleId: role.id } });
      if (adminCount <= 1) return 'LAST_ADMIN';
    }
    await this.host.client.userRole.delete({
      where: { userId_roleId: { userId, roleId: role.id } },
    });
    return 'REMOVED';
  }

}
