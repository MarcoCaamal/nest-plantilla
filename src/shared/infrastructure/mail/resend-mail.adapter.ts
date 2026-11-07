import { Injectable } from '@nestjs/common';
import { AppConfig } from '@/shared/infrastructure/config/app-config';
import type { PresetEnv } from '@/shared/infrastructure/config/env.schema';
import { MailSenderPort, type TransactionalMail } from '@/shared/application/ports/mail-sender.port';
import { renderMail } from './mail-content';

/** HTTP API: Idempotency-Key makes retry-after-timeout safe at Resend. */
@Injectable()
export class ResendMailAdapter extends MailSenderPort {
  constructor(private readonly config: AppConfig<PresetEnv>) { super(); }

  async send(message: TransactionalMail, deduplicationKey: string): Promise<void> {
    const apiKey = this.config.get('RESEND_API_KEY');
    if (!apiKey) throw new Error('Resend API key is not configured');
    const data = renderMail(message, this.config.get('CORS_ORIGINS')[0]!);
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey,
        'Idempotency-Key': deduplicationKey,
      },
      body: JSON.stringify({ from: this.config.get('MAIL_FROM'), to: [message.to], ...data }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error('Resend returned HTTP ' + response.status);
  }
}
