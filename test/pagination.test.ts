import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { PageQuery, CursorQuery, Paginated } from '@/shared/core/pagination';
import { AccessScope, type AccessScope as AccessScopeType } from '@/shared/domain/auth/access-scope';
import type { ScopedListQuery } from '@/shared/domain/auth/scoped-list-query';
import {
  PageQueryDto, CursorQueryDto, PaginationHttpMapper,
} from '@/shared/infrastructure/http/schemas/pagination-query.schema';

describe('safe HTTP pagination schemas', () => {
  it('parses HTTP strings with bounded defaults', () => {
    const result = PageQueryDto.schema.parse({});
    expect(result).toEqual({ page: 1, limit: 20 });
    expect(PaginationHttpMapper.toPageQuery(result)).toEqual({
      kind: 'page', page: 1, limit: 20,
    });
    const custom = PageQueryDto.schema.parse({ page: '3', limit: '100' });
    expect(custom).toEqual({ page: 3, limit: 100 });
    const cursor = CursorQueryDto.schema.parse({ cursor: 'opaque-token=', limit: '25' });
    expect(PaginationHttpMapper.toCursorQuery(cursor)).toEqual({
      kind: 'cursor', cursor: 'opaque-token=', limit: 25,
    });
    expect(PaginationHttpMapper.toCursorQuery(CursorQueryDto.schema.parse({})))
      .toEqual({ kind: 'cursor', limit: 20 });
  });

  it('rejects invalid pages, unsafe limits and oversized cursors', () => {
    for (const page of ['0', '-1', '1.5', '1000001', 'abc', '']) {
      expect(PageQueryDto.schema.safeParse({ page }).success).toBe(false);
    }
    for (const limit of ['0', '-3', '1.2', '101', 'oops', '']) {
      expect(PageQueryDto.schema.safeParse({ limit }).success).toBe(false);
      expect(CursorQueryDto.schema.safeParse({ limit }).success).toBe(false);
    }
    for (const cursor of ['', ' a', 'a ', 'x'.repeat(2049)]) {
      expect(CursorQueryDto.schema.safeParse({ cursor }).success).toBe(false);
    }
  });

  it('can be extended with feature-specific HTTP filters and Swagger metadata', () => {
    const ordersListSchema = PageQueryDto.schema.extend({
      status: z.enum(['OPEN', 'CLOSED']).optional(),
    });
    expect(ordersListSchema.parse({ page: '2', status: 'OPEN' })).toEqual({
      page: 2, limit: 20, status: 'OPEN',
    });
    expect(PageQueryDto.openApiSchema).toMatchObject({ type: 'object' });
    expect(CursorQueryDto.openApiSchema).toMatchObject({ type: 'object' });
  });
});

interface Row {
  readonly id: string;
  readonly tenantId: string;
  readonly status: string;
}
interface TenantScope {
  readonly tenantId: string;
}
interface RowFilters {
  readonly status?: string;
  readonly tenantId?: string;
}

/**
 * Demonstrates the mandatory ScopedListQuery parameter and AND semantics.
 * Actual SQL/ORM filtering belongs to the concrete repository, not shared.
 */
class InMemoryRowsRepository {
  constructor(private readonly rows: readonly Row[]) {}

  async list(input: ScopedListQuery<TenantScope, RowFilters, PageQuery>): Promise<Paginated<Row>> {
    const { scope, pagination, filters } = input;
    const data = this.rows.filter((row) => {
      const inScope = scope.kind === 'UNRESTRICTED' ||
        row.tenantId === scope.constraints.tenantId;
      const matchesFilters =
        (filters.tenantId === undefined || row.tenantId === filters.tenantId) &&
        (filters.status === undefined || row.status === filters.status);
      return inScope && matchesFilters;
    });

    return {
      kind: 'page',
      items: data.slice((pagination.page - 1) * pagination.limit, pagination.page * pagination.limit),
      page: pagination.page,
      limit: pagination.limit,
      total: data.length,
      totalPages: Math.ceil(data.length / pagination.limit),
    };
  }
}

describe('scope-aware repository pagination contracts', () => {
  const repo = new InMemoryRowsRepository([
    { id: 'one', tenantId: 'tenant-a', status: 'OPEN' },
    { id: 'two', tenantId: 'tenant-b', status: 'OPEN' },
    { id: 'three', tenantId: 'tenant-a', status: 'CLOSED' },
  ]);

  it('never lets a tenant-supplied filter widen a constrained access scope', async () => {
    const scope: AccessScopeType<TenantScope> =
      AccessScope.constrained({ tenantId: 'tenant-a' });
    const pagination: PageQuery = { kind: 'page', page: 1, limit: 20 };
    const result = await repo.list({
      scope, pagination, filters: { tenantId: 'tenant-b' },
    });
    expect(result.items).toEqual([]);

    const allowed = await repo.list({ scope, pagination, filters: { status: 'OPEN' } });
    expect(allowed.items.map((item) => item.id)).toEqual(['one']);
  });

  it('describes page and cursor results without an ORM or forced COUNT on cursor', () => {
    const page: Paginated<Row> = {
      kind: 'page', items: [], page: 1, limit: 20, total: 0, totalPages: 0,
    };
    const cursor: Paginated<Row> = {
      kind: 'cursor', items: [], limit: 20, hasMore: false,
    };
    const query: CursorQuery = { kind: 'cursor', limit: 20 };
    expect(page.kind).toBe('page');
    expect(cursor.kind).toBe(query.kind);
    expect('total' in cursor).toBe(false);
  });
});
