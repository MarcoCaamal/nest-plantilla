import 'reflect-metadata';
import {
  Controller, Get, Module, Query, StandardSchemaValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  PageQueryDto, CursorQueryDto, PaginationHttpMapper,
  type PageHttpQuery, type CursorHttpQuery,
} from '@/shared/infrastructure/http/schemas/pagination-query.schema';

class ListController {
  listPage(query: PageHttpQuery) {
    return PaginationHttpMapper.toPageQuery(query);
  }

  listCursor(query: CursorHttpQuery) {
    return PaginationHttpMapper.toCursorQuery(query);
  }
}

Controller('pagination-fixture')(ListController);
Get('page')(
  ListController.prototype, 'listPage',
  Object.getOwnPropertyDescriptor(ListController.prototype, 'listPage')!,
);
Get('cursor')(
  ListController.prototype, 'listCursor',
  Object.getOwnPropertyDescriptor(ListController.prototype, 'listCursor')!,
);
Query({ schema: PageQueryDto.schema })(ListController.prototype, 'listPage', 0);
Query({ schema: CursorQueryDto.schema })(ListController.prototype, 'listCursor', 0);

class FixtureModule {}
Module({ controllers: [ListController] })(FixtureModule);

describe('pagination schemas through real Nest HTTP', () => {
  let app: INestApplication;
  let base: string;

  beforeAll(async () => {
    app = await NestFactory.create(FixtureModule, { logger: false });
    app.useGlobalPipes(new StandardSchemaValidationPipe());
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });

  afterAll(async () => { await app?.close(); });

  it('applies defaults and coercion from HTTP query params', async () => {
    const defaults = await fetch(base + '/pagination-fixture/page');
    expect(defaults.status).toBe(200);
    expect(await defaults.json()).toEqual({ kind: 'page', page: 1, limit: 20 });

    const custom = await fetch(base + '/pagination-fixture/page?page=3&limit=15');
    expect(custom.status).toBe(200);
    expect(await custom.json()).toEqual({ kind: 'page', page: 3, limit: 15 });
  });

  it('validates inputs and returns 400 for dangerous pagination values', async () => {
    for (const query of ['limit=101', 'page=0', 'limit=abc', 'page=2.5']) {
      const response = await fetch(base + '/pagination-fixture/page?' + query);
      expect(response.status).toBe(400);
    }
  });

  it('parses opaque cursors and prevents oversized tokens', async () => {
    const response = await fetch(base + '/pagination-fixture/cursor?cursor=opaque-token&limit=50');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      kind: 'cursor', limit: 50, cursor: 'opaque-token',
    });
    const invalid = await fetch(base + '/pagination-fixture/cursor?cursor=' + 'x'.repeat(2050));
    expect(invalid.status).toBe(400);
  });
});
