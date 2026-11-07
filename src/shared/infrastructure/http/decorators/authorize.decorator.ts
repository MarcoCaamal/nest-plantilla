import { SetMetadata } from '@nestjs/common';
import type { Principal } from '@/shared/domain/auth/principal';

export type HttpGateRequest = Readonly<{
  params: Record<string, unknown>;
  query: Record<string, unknown>;
  body: unknown;
}>;
export type GatePredicate = (
  actor: Principal,
  request: HttpGateRequest,
) => boolean;

export interface GateRule {
  readonly permission: string;
  readonly predicate?: GatePredicate;
}

export const GATE_RULE_KEY = 'nest-plantilla:gate-rule';

/** Static permission plus an optional request-level predicate (not a resource policy). */
export function Authorize(permission: string, predicate?: GatePredicate): MethodDecorator & ClassDecorator {
  const rule: GateRule = predicate ? { permission, predicate } : { permission };
  return SetMetadata(GATE_RULE_KEY, rule);
}
