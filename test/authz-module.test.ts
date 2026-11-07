import { describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '@/app.module';
import { AuthorizeActionUseCase, AuthorizeResourceUseCase, ResolveAccessScopeUseCase } from '@/modules/authz/public';
import { GateGuard } from '@/shared/infrastructure/http/guards/gate.guard';

describe('AuthzModule composition', () => {
  it('provides use cases and GateGuard without requiring an authentication provider', async () => {
    const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
    try {
      expect(app.get(GateGuard)).toBeInstanceOf(GateGuard);
      expect(app.get(AuthorizeActionUseCase)).toBeInstanceOf(AuthorizeActionUseCase);
      expect(app.get(AuthorizeResourceUseCase)).toBeInstanceOf(AuthorizeResourceUseCase);
      expect(app.get(ResolveAccessScopeUseCase)).toBeInstanceOf(ResolveAccessScopeUseCase);
    } finally {
      await app.close();
    }
  });
});
