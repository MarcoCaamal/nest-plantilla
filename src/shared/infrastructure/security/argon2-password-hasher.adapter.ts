import { Algorithm, hash, verify } from '@node-rs/argon2';
import { PasswordHasherPort } from '@/shared/application/ports/password-hasher.port';

/** OWASP Argon2id recommendation: 19 MiB / 2 iterations / 1 lane minimum. */
export class Argon2PasswordHasherAdapter extends PasswordHasherPort {
  async hash(plain: string): Promise<string> {
    return hash(plain, {
      algorithm: Algorithm.Argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
      outputLen: 32,
    });
  }

  async verify(encoded: string, plain: string): Promise<boolean> {
    return verify(encoded, plain);
  }
}
