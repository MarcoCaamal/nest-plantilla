import type { DomainEvent } from '@/shared/domain/domain-event';

/**
 * Optional external delivery boundary. Not a transactional operation.
 * Use from an outbox dispatcher for reliable delivery, or afterCommit only
 * for explicitly best-effort notifications. Never register a NoOp publisher.
 */
export abstract class DomainEventPublisherPort {
  abstract publish(events: readonly DomainEvent[]): Promise<void>;
}
