/** Password hashing is an application boundary. Never expose hash algorithms to use cases. */
export abstract class PasswordHasherPort {
  abstract hash(plain: string): Promise<string>;
  abstract verify(hash: string, plain: string): Promise<boolean>;
}
