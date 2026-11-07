import { describe, expect, it } from 'vitest';
import { Result, type Result as ResultType } from '@/shared/core/result';
import { DomainEventBuffer, type DomainEvent } from '@/shared/domain/domain-event';
import { UnitOfWorkPort, type AfterCommitHook } from '@/shared/application/ports/unit-of-work.port';
import { TransactionalEventOutboxPort } from '@/shared/application/ports/transactional-event-outbox.port';
import { DomainEventPublisherPort } from '@/shared/application/ports/domain-event-publisher.port';

type OrderConfirmed = DomainEvent & {
  readonly eventName: 'order.confirmed';
  readonly orderStatus: 'CONFIRMED';
};

class OrderAggregate {
  readonly events = new DomainEventBuffer<OrderConfirmed>();

  confirm(id: string): void {
    this.events.record({
      eventName: 'order.confirmed',
      aggregateId: id,
      occurredAt: '2030-01-02T03:04:05.000Z',
      orderStatus: 'CONFIRMED',
    });
  }
}

type TxContext = {
  pendingEvents: DomainEvent[];
  hooks: AfterCommitHook[];
  rollbackOnly: boolean;
};

/** Test-only transactional adapter. There is no production ORM or event bus. */
class FakeUnitOfWork extends UnitOfWorkPort {
  private active?: TxContext;
  readonly committedEvents: DomainEvent[] = [];
  readonly commits: number[] = [];
  readonly rollbacks: number[] = [];

  current(): TxContext {
    if (!this.active) throw new Error('No active transaction');
    return this.active;
  }

  afterCommit(hook: AfterCommitHook): void {
    this.current().hooks.push(hook);
  }

  async runInTransaction<T, E>(
    work: () => Promise<ResultType<T, E>>,
  ): Promise<ResultType<T, E>> {
    // Nested transactions join the outer context and may mark it rollback-only.
    if (this.active) {
      const result = await work();
      if (!result.ok) this.active.rollbackOnly = true;
      return result;
    }

    const tx: TxContext = { pendingEvents: [], hooks: [], rollbackOnly: false };
    this.active = tx;
    let result: ResultType<T, E>;
    try {
      result = await work();
      if (!result.ok) {
        this.rollbacks.push(1);
        return result;
      }
      // A swallowed nested failure made the transaction rollback-only;
      // the outer caller must never receive a false committed success.
      if (tx.rollbackOnly) throw new Error('Transaction marked rollback-only');
      this.committedEvents.push(...tx.pendingEvents);
      this.commits.push(1);
    } catch (error) {
      this.rollbacks.push(1);
      throw error;
    } finally {
      this.active = undefined;
    }

    // Commit already happened. Hook failures cannot undo it.
    for (const hook of tx.hooks) await hook();
    return result;
  }
}

class FakeTransactionalOutbox extends TransactionalEventOutboxPort {
  constructor(private readonly unitOfWork: FakeUnitOfWork) { super(); }

  async append(events: readonly DomainEvent[]): Promise<void> {
    this.unitOfWork.current().pendingEvents.push(...events);
  }
}

class RecordingPublisher extends DomainEventPublisherPort {
  readonly delivered: DomainEvent[] = [];
  async publish(events: readonly DomainEvent[]): Promise<void> {
    this.delivered.push(...events);
  }
}

describe('DomainEventBuffer + transaction contract', () => {
  it('captures facts without publishing, and returns a non-destructive snapshot', () => {
    const order = new OrderAggregate();
    order.confirm('order-001');
    const a = order.events.peek();
    const b = order.events.peek();
    expect(a).toEqual(b);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({
      eventName: 'order.confirmed',
      aggregateId: 'order-001',
      occurredAt: '2030-01-02T03:04:05.000Z',
    });
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.isFrozen(a[0])).toBe(true);
    expect(order.events.peek()).toHaveLength(1);
    order.events.clear();
    expect(order.events.peek()).toHaveLength(0);
  });

  it('atomically commits staged outbox events and clears aggregate only after commit', async () => {
    const uow = new FakeUnitOfWork();
    const outbox = new FakeTransactionalOutbox(uow);
    const order = new OrderAggregate();
    order.confirm('order-002');
    const response = await uow.runInTransaction(async () => {
      await outbox.append(order.events.peek());
      return Result.ok('saved');
    });
    expect(response).toEqual(Result.ok('saved'));
    expect(uow.committedEvents).toHaveLength(1);
    expect(order.events.peek()).toHaveLength(1);
    // Acknowledge only after a successful transaction.
    if (response.ok) order.events.clear();
    expect(order.events.peek()).toHaveLength(0);
  });

  it('rolls back business errors and discards pending afterCommit callbacks', async () => {
    const uow = new FakeUnitOfWork();
    const outbox = new FakeTransactionalOutbox(uow);
    const order = new OrderAggregate();
    order.confirm('order-003');
    let notified = false;
    const failure = { type: 'ORDER_NOT_ELIGIBLE' } as const;
    const result = await uow.runInTransaction(async () => {
      await outbox.append(order.events.peek());
      uow.afterCommit(() => { notified = true; });
      return Result.err(failure);
    });
    expect(result).toEqual(Result.err(failure));
    expect(result.ok).toBe(false);
    expect(uow.committedEvents).toHaveLength(0);
    expect(notified).toBe(false);
    expect(order.events.peek()).toHaveLength(1);
    expect(uow.rollbacks).toHaveLength(1);
  });

  it('preserves unexpected technical exception and rolls back', async () => {
    const uow = new FakeUnitOfWork();
    const outbox = new FakeTransactionalOutbox(uow);
    const boom = new Error('storage failed');
    await expect(uow.runInTransaction(async () => {
      await outbox.append([{
        eventName: 'order.confirmed', aggregateId: 'order-4',
        occurredAt: '2030-01-02T03:04:05.000Z',
      }]);
      throw boom;
    })).rejects.toBe(boom);
    expect(uow.committedEvents).toHaveLength(0);
    expect(uow.rollbacks).toHaveLength(1);
  });

  it('joins nested transactions and prevents a swallowed nested failure from committing', async () => {
    const uow = new FakeUnitOfWork();
    const outbox = new FakeTransactionalOutbox(uow);
    await expect(uow.runInTransaction(async () => {
      const nested = await uow.runInTransaction(async () => {
        await outbox.append([{
          eventName: 'test.event', aggregateId: 'item-1',
          occurredAt: '2030-01-02T03:04:05.000Z',
        }]);
        return Result.err({ type: 'NESTED_ERROR' } as const);
      });
      expect(nested.ok).toBe(false);
      return Result.ok('should-not-commit');
    })).rejects.toThrow('rollback-only');
    expect(uow.committedEvents).toHaveLength(0);
  });

  it('runs afterCommit only after commit; failures do not undo persisted data', async () => {
    const uow = new FakeUnitOfWork();
    const outbox = new FakeTransactionalOutbox(uow);
    const publisher = new RecordingPublisher();
    const event: DomainEvent = {
      eventName: 'item.created', aggregateId: 'item-1',
      occurredAt: '2030-01-02T03:04:05.000Z',
    };
    const failure = new Error('broker unreachable');
    await expect(uow.runInTransaction(async () => {
      await outbox.append([event]);
      uow.afterCommit(async () => {
        expect(uow.committedEvents).toEqual([event]);
        await publisher.publish([event]);
        throw failure;
      });
      return Result.ok('ok');
    })).rejects.toBe(failure);
    expect(uow.committedEvents).toEqual([event]);
    expect(publisher.delivered).toEqual([event]);
    expect(uow.rollbacks).toHaveLength(0);
  });
});
