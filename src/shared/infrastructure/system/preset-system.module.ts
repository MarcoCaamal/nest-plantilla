import { Global, Module } from '@nestjs/common';
import { ClockPort } from '@/shared/application/ports/clock.port';
import { IdGeneratorPort } from '@/shared/application/ports/id-generator.port';
import { PasswordHasherPort } from '@/shared/application/ports/password-hasher.port';
import { SystemClock } from './system-clock';
import { UuidV7Generator } from './uuid-v7-generator';
import { Argon2PasswordHasherAdapter } from '@/shared/infrastructure/security/argon2-password-hasher.adapter';

@Global()
@Module({
  providers: [
    { provide: ClockPort, useClass: SystemClock },
    { provide: IdGeneratorPort, useClass: UuidV7Generator },
    { provide: PasswordHasherPort, useClass: Argon2PasswordHasherAdapter },
  ],
  exports: [ClockPort, IdGeneratorPort, PasswordHasherPort],
})
export class PresetSystemModule {}
