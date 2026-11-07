import type { Result } from '@/shared/core/result';

export type AfterCommitHook = () => void | Promise<void>;

/**
 * Result.ok: COMMIT, then run afterCommit hooks, return the same result.
 * Result.err: ROLLBACK, discard hooks, return the same business error unchanged.
 * Technical exception: ROLLBACK if still active; rethrow original exception.
 * Nested calls and hooks must share the active transaction context.
 *
 * A post-commit hook cannot roll back an already committed transaction.
 * Critical delivery should instead use a transactional outbox adapter.
 * Concrete implementations (Prisma, Sequelize, etc.) are project-specific.
 */
export abstract class UnitOfWorkPort {
  abstract runInTransaction<T, E>(
    work: () => Promise<Result<T, E>>,
  ): Promise<Result<T, E>>;

  abstract afterCommit(callback: AfterCommitHook): void;
}
