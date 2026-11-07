export abstract class ApiKeyMaterialPort {
  abstract generate(): string;
  abstract digest(apiKey: string): string;
}
