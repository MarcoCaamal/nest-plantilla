/** Provider-neutral pagination contracts. No HTTP, database or ORM dependencies. */
export interface PageQuery {
  readonly kind: 'page';
  readonly page: number;
  readonly limit: number;
}

export interface CursorQuery {
  readonly kind: 'cursor';
  /** Opaque continuation token; validation and signing belong to the adapter. */
  readonly cursor?: string;
  readonly limit: number;
}

export type PaginationQuery = PageQuery | CursorQuery;

export interface PageResult<T> {
  readonly kind: 'page';
  readonly items: readonly T[];
  readonly page: number;
  readonly limit: number;
  readonly total: number;
  readonly totalPages: number;
}

export interface CursorResult<T> {
  readonly kind: 'cursor';
  readonly items: readonly T[];
  readonly limit: number;
  readonly hasMore: boolean;
  readonly nextCursor?: string;
}

/** Cursor queries do not require an expensive COUNT(*) operation. */
export type Paginated<T> = PageResult<T> | CursorResult<T>;
