import type { DomainEvent } from '@/shared/domain/domain-event';

/**
 * Records events atomically alongside aggregate writes inside the SAME active
 * UnitOfWorkPort transaction. An adapter without transaction-sharing MUST NOT
 * implement this contract as though it were reliable.
 *
 * Persist event identity/idempotency information in the concrete project when
 * implementing delivery and retries. Nothing is published to a broker here.
 */
export abstract class TransactionalEventOutboxPort {
  abstract append(events: readonly DomainEvent[]): Promise<void>;
}
