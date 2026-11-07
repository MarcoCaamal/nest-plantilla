import { Global, Module } from '@nestjs/common';
import { ClockPort } from '@/shared/application/ports/clock.port';
import { IdGeneratorPort } from '@/shared/application/ports/id-generator.port';
import { SystemClock } from './system-clock';
import { UuidV7Generator } from './uuid-v7-generator';

@Global()
@Module({
  providers: [
    { provide: ClockPort, useClass: SystemClock },
    { provide: IdGeneratorPort, useClass: UuidV7Generator },
  ],
  exports: [ClockPort, IdGeneratorPort],
})
export class PresetSystemModule {}
