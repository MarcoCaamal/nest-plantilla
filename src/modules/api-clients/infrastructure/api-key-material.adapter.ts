import { createHash, randomBytes } from 'node:crypto';
import { ApiKeyMaterialPort } from '../application/ports/api-key-material.port';

export class SecureApiKeyMaterialAdapter extends ApiKeyMaterialPort {
  generate(): string { return 'np_' + randomBytes(48).toString('base64url'); }
  digest(apiKey: string): string { return createHash('sha256').update(apiKey).digest('hex'); }
}
