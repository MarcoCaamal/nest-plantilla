import { Injectable } from '@nestjs/common';
import type { Session, NewSession } from '../../domain/entities/session.entity';
import { PrismaHost } from '@/shared/infrastructure/persistence/prisma-unit-of-work';
import {
  SessionRepositoryPort,
} from '../../application/ports/session-repository.port';

@Injectable()
export class PrismaSessionRepository extends SessionRepositoryPort {
  constructor(private readonly host: PrismaHost) { super(); }

  async create(input: NewSession): Promise<void> {
    await this.host.client.session.create({ data: { ...input } });
  }

  async findByTokenHash(tokenHash: string): Promise<Session | null> {
    return this.host.client.session.findUnique({ where: { tokenHash } });
  }

  async rotate(old: Session, next: NewSession, now: Date): Promise<'ROTATED' | 'REUSED'> {
    const updated = await this.host.client.session.updateMany({
      where: {
        id: old.id, revokedAt: null, replacedBySessionId: null, expiresAt: { gt: now },
      },
      data: { revokedAt: now, replacedBySessionId: next.id },
    });
    if (updated.count !== 1) {
      await this.revokeFamily(old.familyId, now);
      return 'REUSED';
    }
    await this.create(next);
    return 'ROTATED';
  }

  async revokeFamily(familyId: string, now: Date): Promise<void> {
    await this.host.client.session.updateMany({
      where: { familyId, revokedAt: null }, data: { revokedAt: now },
    });
  }

  async revokeById(id: string, userId: string, now: Date): Promise<void> {
    await this.host.client.session.updateMany({
      where: { id, userId, revokedAt: null }, data: { revokedAt: now },
    });
  }

  async revokeAll(userId: string, now: Date): Promise<void> {
    await this.host.client.session.updateMany({
      where: { userId, revokedAt: null }, data: { revokedAt: now },
    });
  }

  async isActive(id: string, userId: string, now: Date): Promise<boolean> {
    const session = await this.host.client.session.findFirst({
      where: { id, userId, revokedAt: null, expiresAt: { gt: now } },
      select: { id: true },
    });
    return session !== null;
  }
}
