import type { Session, NewSession } from '../../domain/entities/session.entity';

export abstract class SessionRepositoryPort {
  abstract create(input: NewSession): Promise<void>;
  abstract findByTokenHash(tokenHash: string): Promise<Session | null>;
  /** Conditional single-winner rotation; on replay revoke the entire family. */
  abstract rotate(oldSession: Session, next: NewSession, now: Date): Promise<'ROTATED' | 'REUSED'>;
  abstract revokeFamily(familyId: string, now: Date): Promise<void>;
  abstract revokeById(id: string, userId: string, now: Date): Promise<void>;
  abstract revokeAll(userId: string, now: Date): Promise<void>;
  abstract isActive(id: string, userId: string, now: Date): Promise<boolean>;
}
