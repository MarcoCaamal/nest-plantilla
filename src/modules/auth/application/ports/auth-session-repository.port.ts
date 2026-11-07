export interface AuthSession {
  readonly id: string;
  readonly userId: string;
  readonly familyId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
  readonly replacedBySessionId: string | null;
}
export interface NewSession {
  readonly id: string;
  readonly userId: string;
  readonly familyId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly userAgent?: string;
  readonly ipAddress?: string;
}

export abstract class AuthSessionRepositoryPort {
  abstract create(input: NewSession): Promise<void>;
  abstract findByTokenHash(tokenHash: string): Promise<AuthSession | null>;
  /** Conditional single-winner rotation; on conflict revoke the family. */
  abstract rotate(oldSession: AuthSession, next: NewSession, now: Date): Promise<'ROTATED' | 'REUSED'>;
  abstract revokeFamily(familyId: string, now: Date): Promise<void>;
  abstract revokeById(id: string, userId: string, now: Date): Promise<void>;
  abstract revokeAll(userId: string, now: Date): Promise<void>;
  abstract isActive(id: string, userId: string, now: Date): Promise<boolean>;
}
