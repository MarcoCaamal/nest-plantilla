import { createHash, randomBytes } from 'node:crypto';
import { OpaqueTokenGeneratorPort } from '../../application/ports/opaque-token-generator.port';

export class SecureOpaqueTokenAdapter extends OpaqueTokenGeneratorPort {
  generate(): string { return randomBytes(48).toString('base64url'); }
  digest(token: string): string { return createHash('sha256').update(token).digest('hex'); }
}
