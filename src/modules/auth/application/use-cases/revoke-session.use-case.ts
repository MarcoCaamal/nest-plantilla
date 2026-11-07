import { Result, type Result as ResultType } from '@/shared/core/result';
import { ClockPort } from '@/shared/application/ports/clock.port';
import { SessionRepositoryPort } from '../ports/session-repository.port';

export class RevokeSessionUseCase {
  constructor(private readonly sessions: SessionRepositoryPort, private readonly clock: ClockPort) {}

  async execute(userId: string, sessionId: string): Promise<ResultType<void, never>> {
    await this.sessions.revokeById(sessionId, userId, this.clock.now());
    return Result.ok(undefined);
  }

  async all(userId: string): Promise<ResultType<void, never>> {
    await this.sessions.revokeAll(userId, this.clock.now());
    return Result.ok(undefined);
  }
}
