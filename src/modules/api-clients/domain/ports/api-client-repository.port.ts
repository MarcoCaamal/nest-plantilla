export interface NewApiClient {
  readonly id: string;
  readonly name: string;
  readonly keyPrefix: string;
  readonly keyHash: string;
  readonly scopes: readonly string[];
  readonly permissions: readonly string[];
}
export abstract class ApiClientRepositoryPort {
  abstract create(input: NewApiClient): Promise<void>;
}
