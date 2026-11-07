import { randomUUID } from 'node:crypto';
import { IdGeneratorPort } from '@/shared/application/ports/id-generator.port';

/** Optional UUID v4 adapter. Projects may use ULID/UUIDv7 instead. */
export class UuidGenerator extends IdGeneratorPort {
  generate(): string {
    return randomUUID();
  }
}
