import type { AccessScope } from '@/shared/domain/auth/access-scope';

/** Always AND caller-supplied filters with the enforced authorization scope. */
export function scopedPrismaWhere<TWhere extends object>(
  access: AccessScope<TWhere>,
  filters: TWhere,
): { AND: TWhere[] } | TWhere {
  return access.kind === 'UNRESTRICTED'
    ? filters
    : { AND: [access.constraints as TWhere, filters] };
}
