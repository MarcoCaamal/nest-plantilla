export abstract class OpaqueTokenGeneratorPort {
  abstract generate(): string;
  abstract digest(token: string): string;
}
