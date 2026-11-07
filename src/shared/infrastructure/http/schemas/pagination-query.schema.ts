import { z } from 'zod';
import type { CursorQuery, PageQuery } from '@/shared/core/pagination';
import { createZodDto } from '../swagger/zod-dto.helper';

/** Defaults and limits apply at the HTTP boundary, not in repositories. */
const httpLimit = z.coerce.number().int().min(1).max(100).default(20);

export const PageQueryDto = createZodDto(z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: httpLimit,
}));

export const CursorQueryDto = createZodDto(z.object({
  // Cursor is opaque and should never appear in logs. Reject surrounding space.
  cursor: z.string().min(1).max(2048).refine((value) => value.trim() === value).optional(),
  limit: httpLimit,
}));

export type PageHttpQuery = z.output<typeof PageQueryDto.schema>;
export type CursorHttpQuery = z.output<typeof CursorQueryDto.schema>;

/** Pure HTTP mapper: parsed Zod DTOs become technology-neutral query objects. */
export const PaginationHttpMapper = {
  toPageQuery(input: PageHttpQuery): PageQuery {
    return { kind: 'page', page: input.page, limit: input.limit };
  },

  toCursorQuery(input: CursorHttpQuery): CursorQuery {
    return {
      kind: 'cursor',
      limit: input.limit,
      ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
    };
  },
};
