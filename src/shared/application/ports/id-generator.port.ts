/** Domain identities are assigned before persistence, not by an ORM. */
export abstract class IdGeneratorPort {
  abstract generate(): string;
}
