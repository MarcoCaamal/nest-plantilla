import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { UnitOfWorkPort, type AfterCommitHook } from '@/shared/application/ports/unit-of-work.port';
import type { Result } from '@/shared/core/result';
import { PrismaService } from './prisma.service';

type TransactionState = {
  tx: Prisma.TransactionClient;
  hooks: AfterCommitHook[];
  rollbackOnly: boolean;
};

class BusinessRollback extends Error {
  constructor(readonly result: Result<unknown, unknown>) { super('Rollback requested'); }
}

const transactions = new AsyncLocalStorage<TransactionState>();

@Injectable()
export class PrismaHost {
  constructor(private readonly prisma: PrismaService) {}

  /** Repositories use this property without seeing transaction arguments. */
  get client(): Prisma.TransactionClient {
    return transactions.getStore()?.tx ?? this.prisma;
  }

  get inTransaction(): boolean { return Boolean(transactions.getStore()); }
}

@Injectable()
export class PrismaUnitOfWork extends UnitOfWorkPort {
  constructor(private readonly prisma: PrismaService) { super(); }

  async runInTransaction<T, E>(work: () => Promise<Result<T, E>>): Promise<Result<T, E>> {
    const existing = transactions.getStore();
    if (existing) {
      const result = await work();
      if (!result.ok) existing.rollbackOnly = true;
      return result;
    }

    let hooks: AfterCommitHook[] = [];
    let output: Result<T, E>;
    try {
      output = await this.prisma.$transaction(async (tx) => {
        const context: TransactionState = { tx, hooks: [], rollbackOnly: false };
        const result = await transactions.run(context, work);
        if (!result.ok) throw new BusinessRollback(result);
        // A swallowed nested Result.err must never be committed.
        if (context.rollbackOnly) throw new Error('Nested transaction signalled rollback');
        hooks = context.hooks;
        return result;
      });
    } catch (error) {
      if (error instanceof BusinessRollback) return error.result as Result<T, E>;
      throw error;
    }

    // No afterCommit callback may run before the database reports COMMIT success.
    for (const hook of hooks) await hook();
    return output;
  }

  afterCommit(callback: AfterCommitHook): void {
    const current = transactions.getStore();
    if (!current) throw new Error('afterCommit requires an active UnitOfWork');
    current.hooks.push(callback);
  }
}
