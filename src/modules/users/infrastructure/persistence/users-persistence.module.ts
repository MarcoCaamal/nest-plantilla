import { Global, Module } from '@nestjs/common';
import { UserRepositoryPort } from '../../application/ports/user-repository.port';
import { PrismaUserRepository } from './prisma-user.repository';

@Global()
@Module({
  providers: [PrismaUserRepository, { provide: UserRepositoryPort, useExisting: PrismaUserRepository }],
  exports: [UserRepositoryPort],
})
export class UsersPersistenceModule {}
