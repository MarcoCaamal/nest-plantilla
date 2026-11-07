import { Global, Module } from '@nestjs/common';
import { UnitOfWorkPort } from '@/shared/application/ports/unit-of-work.port';
import { PrismaService } from './prisma.service';
import { PrismaHost, PrismaUnitOfWork } from './prisma-unit-of-work';

@Global()
@Module({
  providers: [
    PrismaService,
    PrismaHost,
    PrismaUnitOfWork,
    { provide: UnitOfWorkPort, useExisting: PrismaUnitOfWork },
  ],
  exports: [PrismaService, PrismaHost, PrismaUnitOfWork, UnitOfWorkPort],
})
export class PrismaModule {}
