import { Injectable } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { MailSenderPort, type TransactionalMail } from '@/shared/application/ports/mail-sender.port';
import { AppConfig } from '@/shared/infrastructure/config/app-config';
import type { PresetEnv } from '@/shared/infrastructure/config/env.schema';
import { jsonLogger } from '@/shared/infrastructure/observability/logging/json-logger';
import { renderMail } from './mail-content';

@Injectable()
export class ConsoleOrMailpitAdapter extends MailSenderPort {
  constructor(private readonly config: AppConfig<PresetEnv>) { super(); }

  async send(message: TransactionalMail, deduplicationKey: string): Promise<void> {
    const host = this.config.get('MAILPIT_HOST');
    if (!host) {
      // Do not emit verification/reset secrets to console, even in development.
      jsonLogger.log({ event: 'mail.preview', kind: message.kind, eventId: deduplicationKey });
      return;
    }
    const transporter = nodemailer.createTransport({ host, port: this.config.get('MAILPIT_PORT'), secure: false });
    await transporter.sendMail({
      from: this.config.get('MAIL_FROM'),
      to: message.to,
      ...renderMail(message, this.config.get('CORS_ORIGINS')[0]!),
    });
    transporter.close();
  }
}
