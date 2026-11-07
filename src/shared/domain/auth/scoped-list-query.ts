import type { PaginationQuery } from '@/shared/core/pagination';
import type { AccessScope } from './access-scope';

/**
 * Mandatory scope in the repository boundary. Consumers must obtain this from
 * ResourcePolicy.resolveScope(actor), never from user-controlled query params.
 * Implementations MUST intersect scope and user filters with logical AND.
 */
export interface ScopedListQuery<
  TConstraints,
  TFilters,
  TPagination extends PaginationQuery = PaginationQuery,
> {
  readonly scope: AccessScope<TConstraints>;
  readonly filters: Readonly<TFilters>;
  readonly pagination: TPagination;
}
