import { Result, type Result as ResultType } from '@/shared/core/result';
import type { UserPrincipal } from '@/shared/domain/auth/principal';
import type { SafeUser } from '../../../domain/entities/user.entity';
import type { UserError } from '../../../domain/errors/user.error';
import { UserRepositoryPort } from '../../ports/user-repository.port';

export class GetMyProfileUseCase {
  constructor(private readonly users: UserRepositoryPort) {}

  async execute(actor: UserPrincipal): Promise<ResultType<SafeUser, UserError>> {
    const user = await this.users.findById(actor.id);
    if (!user || user.status !== 'ACTIVE') return Result.err({ type: 'NOT_FOUND' });
    const { passwordHash: _secret, ...safe } = user;
    void _secret;
    return Result.ok(safe);
  }
}
