import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '@/shared/infrastructure/persistence/prisma.service';
import { MailSenderPort, type TransactionalMail } from '@/shared/application/ports/mail-sender.port';
import { jsonLogger } from '@/shared/infrastructure/observability/logging/json-logger';

@Injectable()
export class PrismaOutboxWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly prisma: PrismaService, private readonly mail: MailSenderPort) {}

  onModuleInit(): void {
    this.timer = setInterval(() => { void this.processBatch().catch((error: unknown) => {
      jsonLogger.error({ event: 'outbox.batch_failed', error: error instanceof Error ? error : undefined });
    }); }, 5000);
    this.timer.unref();
  }

  onModuleDestroy(): void { if (this.timer) clearInterval(this.timer); }

  async processBatch(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    let processed = 0;
    try {
      const now = new Date();
      const candidates = await this.prisma.outboxMessage.findMany({
        where: {
          status: { in: ['PENDING', 'PROCESSING'] },
          nextRetryAt: { lte: now },
        },
        take: 20, orderBy: { createdAt: 'asc' },
      });
      for (const record of candidates) {
        const claimed = await this.prisma.outboxMessage.updateMany({
          where: {
            id: record.id,
            status: record.status,
            nextRetryAt: { lte: now },
          },
          data: {
            status: 'PROCESSING', attempts: { increment: 1 },
            nextRetryAt: new Date(Date.now() + 120000),
          },
        });
        if (claimed.count !== 1) continue;
        try {
          const mail = this.resolveMail(record.eventName, record.payload);
          if (!mail) throw new Error('Unsupported outbox event');
          await this.mail.send(mail, record.id);
          await this.prisma.outboxMessage.update({
            where: { id: record.id },
            data: { status: 'PROCESSED', processedAt: new Date(), lastError: null },
          });
          processed++;
        } catch (error) {
          const tries = record.attempts + 1;
          const fatal = tries >= 8;
          await this.prisma.outboxMessage.update({
            where: { id: record.id },
            data: {
              status: fatal ? 'FAILED' : 'PENDING',
              nextRetryAt: new Date(Date.now() + Math.min(2 ** tries * 1000, 300000)),
              lastError: error instanceof Error ? error.name.slice(0, 200) : 'UnknownError',
            },
          });
          jsonLogger.warn({ event: 'outbox.delivery_failed', eventId: record.id, attempt: tries });
        }
      }
      return processed;
    } finally { this.running = false; }
  }

  private resolveMail(eventName: string, payload: unknown): TransactionalMail | null {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
    const value = payload as Record<string, unknown>;
    if (typeof value.email !== 'string') return null;
    if (eventName === 'account.verify_email_requested' && typeof value.token === 'string') {
      return { kind: 'VERIFY_EMAIL', to: value.email, token: value.token };
    }
    if (eventName === 'account.password_reset_requested' && typeof value.token === 'string') {
      return { kind: 'RESET_PASSWORD', to: value.email, token: value.token };
    }
    if (eventName === 'user.registered') return { kind: 'WELCOME', to: value.email };
    return null;
  }
}
