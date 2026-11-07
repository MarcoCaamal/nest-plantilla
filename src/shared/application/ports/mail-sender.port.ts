export type TransactionalMail =
  | { readonly kind: 'VERIFY_EMAIL'; readonly to: string; readonly token: string }
  | { readonly kind: 'RESET_PASSWORD'; readonly to: string; readonly token: string }
  | { readonly kind: 'WELCOME'; readonly to: string };

export abstract class MailSenderPort {
  /** deduplicationKey is stable across retries; provider supports idempotent send. */
  abstract send(message: TransactionalMail, deduplicationKey: string): Promise<void>;
}
