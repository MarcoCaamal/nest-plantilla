import { Injectable } from '@nestjs/common';
import { PrismaHost } from '@/shared/infrastructure/persistence/prisma-unit-of-work';
import {
  AccountTokenRepositoryPort, type AccountTokenPurpose,
} from '../../application/ports/account-token-repository.port';

@Injectable()
export class PrismaAccountTokenRepository extends AccountTokenRepositoryPort {
  constructor(private readonly host: PrismaHost) { super(); }

  async issue(input: { id: string; userId: string; purpose: AccountTokenPurpose; tokenHash: string; expiresAt: Date }): Promise<void> {
    await this.host.client.accountToken.create({ data: input });
  }

  async consume(tokenHash: string, purpose: AccountTokenPurpose, now: Date): Promise<string | null> {
    const record = await this.host.client.accountToken.findUnique({ where: { tokenHash } });
    if (!record || record.purpose !== purpose) return null;
    const consumed = await this.host.client.accountToken.updateMany({
      where: { id: record.id, consumedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now },
    });
    return consumed.count === 1 ? record.userId : null;
  }
}
