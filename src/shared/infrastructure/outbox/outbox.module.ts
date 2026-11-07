import { Global, Module } from '@nestjs/common';
import { MailSenderPort } from '@/shared/application/ports/mail-sender.port';
import { TransactionalEventOutboxPort } from '@/shared/application/ports/transactional-event-outbox.port';
import { AppConfig } from '@/shared/infrastructure/config/app-config';
import type { PresetEnv } from '@/shared/infrastructure/config/env.schema';
import { ConsoleOrMailpitAdapter } from '../mail/console-or-mailpit.adapter';
import { ResendMailAdapter } from '../mail/resend-mail.adapter';
import { PrismaTransactionalOutboxAdapter } from './prisma-transactional-outbox.adapter';
import { PrismaOutboxWorker } from './prisma-outbox-worker';

@Global()
@Module({
  providers: [
    {
      provide: MailSenderPort,
      useFactory: (config: AppConfig<PresetEnv>) =>
        config.get('NODE_ENV') === 'production'
          ? new ResendMailAdapter(config) : new ConsoleOrMailpitAdapter(config),
      inject: [AppConfig],
    },
    PrismaTransactionalOutboxAdapter,
    { provide: TransactionalEventOutboxPort, useExisting: PrismaTransactionalOutboxAdapter },
    PrismaOutboxWorker,
  ],
  exports: [MailSenderPort, TransactionalEventOutboxPort, PrismaOutboxWorker],
})
export class OutboxModule {}
