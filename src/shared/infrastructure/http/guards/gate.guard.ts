import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Principal } from '@/shared/domain/auth/principal';
import { PermissionPolicy } from '@/shared/domain/auth/permission-policy';
import { GATE_RULE_KEY, type GateRule, type HttpGateRequest } from '../decorators/authorize.decorator';

type RequestWithPrincipal = HttpGateRequest & { principal?: Principal };

/** Presumes an upstream authentication guard attached a normalized principal. */
@Injectable()
export class GateGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const rule = this.reflector.getAllAndOverride<GateRule>(GATE_RULE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!rule) return true;
    const request = context.switchToHttp().getRequest<RequestWithPrincipal>();
    const actor = request.principal;
    if (!actor) throw new UnauthorizedException('Authentication required');
    if (!PermissionPolicy.require(actor, rule.permission).ok) return false;
    return rule.predicate?.(actor, request) ?? true;
  }
}
