export abstract class AccessTokenIssuerPort {
  abstract issue(input: Readonly<{ userId: string; sessionId: string }>): Promise<string>;
}
