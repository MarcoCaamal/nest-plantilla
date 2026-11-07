import { v7 } from 'uuid';
import { IdGeneratorPort } from '@/shared/application/ports/id-generator.port';

/** RFC 9562 UUID v7; generated before persistence. */
export class UuidV7Generator extends IdGeneratorPort {
  generate(): string {
    return v7();
  }
}
