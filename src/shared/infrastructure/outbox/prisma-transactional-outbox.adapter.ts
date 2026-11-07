import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { IdGeneratorPort } from '@/shared/application/ports/id-generator.port';
import { TransactionalEventOutboxPort } from '@/shared/application/ports/transactional-event-outbox.port';
import type { DomainEvent } from '@/shared/domain/domain-event';
import { PrismaHost } from '@/shared/infrastructure/persistence/prisma-unit-of-work';

@Injectable()
export class PrismaTransactionalOutboxAdapter extends TransactionalEventOutboxPort {
  constructor(private readonly host: PrismaHost, private readonly ids: IdGeneratorPort) { super(); }

  async append(events: readonly DomainEvent[]): Promise<void> {
    if (!this.host.inTransaction) {
      throw new Error('Transactional outbox requires an active UnitOfWorkPort transaction');
    }
    for (const event of events) {
      await this.host.client.outboxMessage.create({
        data: {
          id: this.ids.generate(),
          eventName: event.eventName,
          payload: JSON.parse(JSON.stringify(event)) as Prisma.InputJsonValue,
          nextRetryAt: new Date(),
        },
      });
    }
  }
}
