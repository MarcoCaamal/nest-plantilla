/**
 * Immutable, provider-neutral fact that already happened inside an aggregate.
 * occurredAt is an ISO-8601 instant string (not a mutable Date object).
 * Additional event-specific properties belong to the feature domain.
 */
export interface DomainEvent {
  readonly eventName: string;
  readonly aggregateId: string;
  readonly occurredAt: string;
}

/**
 * Composition helper for aggregate roots. No global bus or implicit publishing.
 * The aggregate controls when events are recorded; its application use case
 * decides how they are persisted within a UnitOfWork.
 */
export class DomainEventBuffer<TEvent extends DomainEvent> {
  private readonly pending: TEvent[] = [];

  record(event: TEvent): void {
    this.pending.push(Object.freeze({ ...event }) as TEvent);
  }

  /** Non-destructive snapshot; do not lose events before a successful commit. */
  peek(): readonly TEvent[] {
    return Object.freeze([...this.pending]);
  }

  /**
   * Acknowledge only after the containing transaction actually commits.
   * On rollback discard/reload the aggregate rather than acknowledging events.
   */
  clear(): void {
    this.pending.length = 0;
  }
}
