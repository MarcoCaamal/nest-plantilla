export type AccountTokenPurpose = 'VERIFY_EMAIL' | 'RESET_PASSWORD';
export abstract class AccountTokenRepositoryPort {
  abstract issue(input: Readonly<{
    id: string; userId: string; purpose: AccountTokenPurpose;
    tokenHash: string; expiresAt: Date;
  }>): Promise<void>;
  abstract consume(tokenHash: string, purpose: AccountTokenPurpose, now: Date): Promise<string | null>;
}
