import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiKeyAuthenticationGuard } from '../guards/api-key-authentication.guard';
import { CurrentPrincipal } from '@/shared/infrastructure/http/decorators/current-principal.decorator';
import type { MachinePrincipal } from '@/shared/domain/auth/principal';

@Controller('partner-b2b')
@UseGuards(ApiKeyAuthenticationGuard)
export class PartnerIdentityController {
  @Get('whoami')
  whoami(@CurrentPrincipal() actor: MachinePrincipal) {
    return { id: actor.id, type: actor.type, permissions: actor.permissions, scopes: actor.attributes.scopes };
  }
}
