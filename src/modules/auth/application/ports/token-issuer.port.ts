export abstract class TokenIssuerPort {
  abstract issue(input: Readonly<{ userId: string; sessionId: string }>): Promise<string>;
}
