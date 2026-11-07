import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Result } from '@/shared/core/result';
import { AppConfig, parseEnv } from '@/shared/infrastructure/config/app-config';
import { presetEnvSchema, type PresetEnv } from '@/shared/infrastructure/config/env.schema';
import { PrismaService } from '@/shared/infrastructure/persistence/prisma.service';
import { PrismaHost, PrismaUnitOfWork } from '@/shared/infrastructure/persistence/prisma-unit-of-work';
import { PrismaUserRepository } from '@/modules/users/infrastructure/persistence/prisma-user.repository';
import { PrismaSessionRepository } from '@/modules/auth/infrastructure/persistence/prisma-session.repository';
import { PrismaAccountTokenRepository } from '@/modules/auth/infrastructure/persistence/prisma-account-token.repository';
import { PrismaTransactionalOutboxAdapter } from '@/shared/infrastructure/outbox/prisma-transactional-outbox.adapter';
import { PrismaOutboxWorker } from '@/shared/infrastructure/outbox/prisma-outbox-worker';
import { MailSenderPort, type TransactionalMail } from '@/shared/application/ports/mail-sender.port';
import { Argon2PasswordHasherAdapter } from '@/modules/auth/infrastructure/security/argon2-password-hasher.adapter';
import { UuidV7Generator } from '@/shared/infrastructure/system/uuid-v7-generator';
import { SystemClock } from '@/shared/infrastructure/system/system-clock';
import { JwtTokenAdapter } from '@/modules/auth/infrastructure/security/jwt-token.adapter';
import { JwtUserCredentialVerifierAdapter } from '@/modules/auth/infrastructure/security/jwt-user-credential-verifier.adapter';
import { SecureOpaqueTokenAdapter } from '@/modules/auth/infrastructure/security/opaque-token.adapter';
import { SessionTokenService } from '@/modules/auth/application/services/session-token.service';
import { RegisterUseCase } from '@/modules/auth/application/use-cases/register.use-case';
import { VerifyEmailUseCase } from '@/modules/auth/application/use-cases/verify-email.use-case';
import { LoginWithPasswordUseCase } from '@/modules/auth/application/use-cases/loginWithPassword.use-case';
import { RefreshSessionUseCase } from '@/modules/auth/application/use-cases/refresh-session.use-case';

const database = process.env.TEST_DATABASE_URL;
const run = database ? describe : describe.skip;

class SpyMailSender extends MailSenderPort {
  readonly deliveries: { mail: TransactionalMail; key: string }[] = [];
  async send(mail: TransactionalMail, key: string): Promise<void> {
    this.deliveries.push({ mail, key });
  }
}

run('Prisma + PostgreSQL preset integration', () => {
  let prisma: PrismaService;
  let host: PrismaHost;
  let uow: PrismaUnitOfWork;
  let users: PrismaUserRepository;
  let sessions: PrismaSessionRepository;
  let registrationCase: RegisterUseCase;
  let verifyEmailCase: VerifyEmailUseCase;
  let loginCase: LoginWithPasswordUseCase;
  let refreshCase: RefreshSessionUseCase;
  let verifier: JwtUserCredentialVerifierAdapter;
  let worker: PrismaOutboxWorker;
  let mail: SpyMailSender;
  let config: AppConfig<PresetEnv>;
  const ids = new UuidV7Generator();
  const allocated: { id: string; email: string }[] = [];

  beforeAll(async () => {
    config = new AppConfig(parseEnv({
      NODE_ENV: 'test',
      DATABASE_URL: database!,
      JWT_ACCESS_SECRET: 'test-secret-abcdefghijklmnopqrstuvwxyz-0123456789',
      MAIL_FROM: 'test@example.test',
    }, presetEnvSchema));
    prisma = new PrismaService(config);
    await prisma.$connect();
    host = new PrismaHost(prisma);
    uow = new PrismaUnitOfWork(prisma);
    users = new PrismaUserRepository(host);
    sessions = new PrismaSessionRepository(host);
    const opaque = new SecureOpaqueTokenAdapter();
    const clock = new SystemClock();
    mail = new SpyMailSender();
    const passwords = new Argon2PasswordHasherAdapter();
    const oneTime = new PrismaAccountTokenRepository(host);
    const outbox = new PrismaTransactionalOutboxAdapter(host, ids);
    const tokens = new SessionTokenService(ids, clock, opaque, new JwtTokenAdapter(config), 900, 30);
    registrationCase = new RegisterUseCase(users, passwords, ids, clock, opaque, oneTime, outbox, uow);
    verifyEmailCase = new VerifyEmailUseCase(users, oneTime, opaque, clock, uow);
    loginCase = new LoginWithPasswordUseCase(users, passwords, ids, sessions, tokens, uow);
    refreshCase = new RefreshSessionUseCase(users, sessions, opaque, clock, tokens, uow);
    verifier = new JwtUserCredentialVerifierAdapter(config, users, sessions);
    worker = new PrismaOutboxWorker(prisma, mail);
  });

  afterAll(async () => {
    if (!prisma) return;
    // Only remove test-owned data, never clear the database globally.
    for (const allocatedUser of allocated) {
      await prisma.outboxMessage.deleteMany({
        where: { payload: { path: ['aggregateId'], equals: allocatedUser.id } },
      });
      await prisma.user.deleteMany({ where: { id: allocatedUser.id } });
    }
    await prisma.$disconnect();
  });

  it('commits on Result.ok, rolls back on Result.err or technical exceptions', async () => {
    const create = async (email: string, id: string) => users.create({
      id, email, passwordHash: 'test-only-not-authenticating', status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    });
    const id1 = ids.generate();
    const email1 = 'rollback-'+id1+'@example.test';
    const rolled = await uow.runInTransaction(async () => {
      await create(email1, id1);
      expect(host.inTransaction).toBe(true);
      expect(host.client).not.toBe(prisma);
      return Result.err({ type: 'ROLLBACK' as const });
    });
    expect(rolled).toEqual(Result.err({ type: 'ROLLBACK' }));
    expect(await users.findById(id1)).toBeNull();

    let committedHook = false;
    const id2 = ids.generate();
    const email2 = 'commit-'+id2+'@example.test';
    const committed = await uow.runInTransaction(async () => {
      await create(email2, id2);
      uow.afterCommit(() => { committedHook = true; });
      return Result.ok(id2);
    });
    allocated.push({ id: id2, email: email2 });
    expect(committed).toEqual(Result.ok(id2));
    expect(committedHook).toBe(true);
    expect((await users.findById(id2))?.id).toBe(id2);

    const id3 = ids.generate();
    const email3 = 'error-'+id3+'@example.test';
    const failure = new Error('technical');
    await expect(uow.runInTransaction(async () => {
      await create(email3, id3);
      throw failure;
    })).rejects.toBe(failure);
    expect(await users.findById(id3)).toBeNull();

    const id4 = ids.generate();
    const email4 = 'nested-'+id4+'@example.test';
    await expect(uow.runInTransaction(async () => {
      await create(email4, id4);
      await uow.runInTransaction(async () => Result.err({ type: 'NESTED_FAIL' }));
      return Result.ok('outer would commit');
    })).rejects.toThrow('Nested transaction signalled rollback');
    expect(await users.findById(id4)).toBeNull();
  });

  it('delivers registration email via Outbox, verifies user, logs in and detects refresh replay', async () => {
    const idSuffix = ids.generate();
    const email = 'flow-'+idSuffix+'@example.test';
    const password = 'StrongPassword-for-integration-test-27';
    const registration = await registrationCase.execute({ email, password });
    expect(registration.ok).toBe(true);
    if (!registration.ok) return;
    allocated.push({ id: registration.value.id, email });
    expect(await users.findByEmail(email)).toMatchObject({ status: 'PENDING_VERIFICATION' });
    const pending = await prisma.outboxMessage.findFirst({
      where: { payload: { path: ['aggregateId'], equals: registration.value.id } },
    });
    expect(pending).toMatchObject({ status: 'PENDING' });

    expect(await worker.processBatch()).toBeGreaterThanOrEqual(1);
    const sent = mail.deliveries.find((x) =>
      x.mail.kind === 'VERIFY_EMAIL' && x.mail.to === email);
    expect(sent?.mail.kind).toBe('VERIFY_EMAIL');
    if (!sent || sent.mail.kind !== 'VERIFY_EMAIL') return;
    expect(await verifyEmailCase.execute(sent.mail.token)).toEqual(Result.ok(undefined));
    expect((await users.findByEmail(email))?.status).toBe('ACTIVE');
    const invalidLogin = await loginCase.execute({ email, password: 'bad' });
    expect(invalidLogin).toEqual(Result.err({ type: 'INVALID_CREDENTIALS' }));

    const login = await loginCase.execute({ email, password });
    expect(login.ok).toBe(true);
    if (!login.ok) return;
    expect((await verifier.verify(login.value.accessToken)).ok).toBe(true);
    const refreshed = await refreshCase.execute(login.value.refreshToken);
    expect(refreshed.ok).toBe(true);
    if (!refreshed.ok) return;
    expect((await verifier.verify(login.value.accessToken)).ok).toBe(false);
    expect((await verifier.verify(refreshed.value.accessToken)).ok).toBe(true);
    expect(await refreshCase.execute(login.value.refreshToken)).toEqual(
      Result.err({ type: 'REFRESH_REUSED' }),
    );
    expect((await verifier.verify(refreshed.value.accessToken)).ok).toBe(false);
    expect(await refreshCase.execute(refreshed.value.refreshToken)).toEqual(
      Result.err({ type: 'REFRESH_INVALID' }),
    );
    const output = await prisma.outboxMessage.findUnique({ where: { id: sent.key } });
    expect(output?.status).toBe('PROCESSED');
  });

  it('scope AND cannot leak rows across a constrained user list', async () => {
    const [one, two] = allocated;
    expect(one).toBeDefined();
    expect(two).toBeDefined();
    const result = await users.list({
      scope: { kind: 'CONSTRAINED', constraints: { allowedUserIds: [one!.id] } },
      filters: { email: 'example.test' },
      pagination: { kind: 'page', page: 1, limit: 20 },
    });
    expect(result.total).toBe(1);
    expect(result.items.map((row) => row.id)).toEqual([one!.id]);
    expect('passwordHash' in result.items[0]!).toBe(false);
  });
});
