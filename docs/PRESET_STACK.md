# Preset opinionated: NestJS + PostgreSQL + OpenObserve + Identity

This document applies only to the **preset/opinionated** branch. The main branch remains technology neutral. All infrastructure is behind ports. Existing UnitOfWorkPort, UserCredentialVerifierPort, ApiKeyVerifierPort, AccessScope and RequestContext are unchanged.

## Local bootstrap

Requirements: Node 24+, pnpm 10+, Docker Compose. Only use pnpm.

~~~sh
cp .env.example .env
docker compose -f docker-compose.dev.yml up -d
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm start
~~~

**Ports deliberately avoid collisions with other local projects.**

| Service | Address |
| --- | --- |
| Nest API and Swagger | http://localhost:3005 and /docs |
| PostgreSQL 17 | 127.0.0.1:5433 |
| Mailpit UI | http://localhost:8026 |
| Mailpit SMTP | localhost:1027 |
| OpenObserve | http://localhost:5080 |

Change the local-only values in .env.example before any shared or production deployment. The seed requires ADMIN_EMAIL and ADMIN_PASSWORD (at least twelve characters); it creates the admin role, users:read, users:write, api-clients:write permissions, and admin account idempotently without resetting existing credentials.

Environment is validated with Zod 4 **before** Nest initialization. Invalid variables abort startup and structured errors include field names, not secret values. Required: DATABASE_URL, JWT_ACCESS_SECRET (32+ characters), MAIL_FROM; RESEND_API_KEY is mandatory in production. The JWT durations default to 900 seconds and 30 days for refresh. CORS_ORIGINS takes comma-separated HTTP(S) origins.

## Ports and adapters

| Contract | Concrete adapter |
| --- | --- |
| UnitOfWorkPort.runInTransaction | PrismaUnitOfWork with interactive transactions + AsyncLocalStorage |
| IdGeneratorPort | RFC 9562 UUID v7 |
| ClockPort | SystemClock |
| PasswordHasherPort | Argon2id (@node-rs/argon2) |
| UserRepositoryPort and RoleRepositoryPort | Prisma repositories and static mappers |
| UserCredentialVerifierPort | jose JWT verifier with authoritative DB session/RBAC lookup |
| ApiKeyVerifierPort | SHA-256 API key lookup, timingSafeEqual |
| MailSenderPort | Resend HTTP with Idempotency-Key, or Mailpit SMTP |
| TransactionalEventOutboxPort | PrismaTransactionalOutboxAdapter |
| RateLimiterPort | InMemoryRateLimiterAdapter |

Domain and application code do not import Nest, Prisma, Zod, JWT, Argon2, Pino, OpenTelemetry or Resend.

**Transactions:** Result.ok commits; Result.err rolls back; technical exceptions rethrow after rollback. afterCommit runs only after a successful commit. Nested UoW calls share a transaction. PrismaHost.client returns the current transaction client from ALS or the root client automatically, with no Prisma arguments in use cases. The outbox adapter refuses to append outside an active transaction.

**Authorization:** staff endpoints use UserAuthenticationGuard **before** GateGuard with the existing Authorize decorator. AccessScope comes from a pure ResourcePolicy, and scopedPrismaWhere() combines scope and caller filters using AND only, never OR. All expected errors map through HttpResult and RFC 9457.

## Identity API

- POST /auth/register: PENDING_VERIFICATION; one-time verification link queued atomically in Outbox; no raw token returned over HTTP.
- POST /auth/verify-email: consumes the one-time token and activates the account.
- POST /auth/login: checks Argon2id; emits short-lived JWT and opaque refresh token. Only SHA-256 refresh hashes are persisted.
- POST /auth/refresh: atomically rotates refresh; reuse of a previously rotated token revokes the **entire family** for that device, committed before returning an error.
- POST /auth/logout, POST /auth/logout-all: revoke one or every active session.
- GET /auth/me: Bearer required, active DB session and active user required.
- POST /auth/forgot-password: non-enumerating response; outbox email for active accounts.
- POST /auth/reset-password: one-hour single-use token; changes hash and revokes all sessions.

The JWT adapter requires HS256 signature, issuer, audience, expiration and valid session ID. Permissions/roles come from the current database record, never unsigned client claims. Substitute an EdDSA/RS256 adapter if asymmetric trust is necessary.

Staff: GET /staff/users, POST /staff/users/:id/roles, GET and POST /staff/roles, POST /staff/roles/:key/permissions, POST /staff/permissions. Requests require users:read or users:write as appropriate.

M2M: POST /staff/api-clients provisions an API key (the raw key is shown **once**, only in the HTTP response). GET /partner-b2b/whoami requires X-API-Key and returns an authenticated MachinePrincipal. Bearer and X-API-Key are not mixed.

## Emails, retries and operational guarantees

Every registration/password-reset request writes a transactional OutboxMessage with the business operation. PrismaOutboxWorker polls and claims eligible records with compare-and-swap, then sends mail **outside** the database transaction and retries with exponential backoff. Messages reach FAILED after eight attempts. Resend receives the stable OutboxMessage ID as its Idempotency-Key to protect against retry duplicates. Mailpit/SMTP cannot guarantee exactly-once delivery: use it only for local development.

Outbox payloads holding short-lived reset/verification links are sensitive data. Apply a database retention/purge policy in production and never print payloads. For multiple worker replicas use stronger lease fencing / an independent worker deployment if high-volume delivery requires it.

## Rate limiting and Idempotency

AuthRateLimitGuard restricts login to five/minute, refresh to fifteen/minute, and forgot-password to three/minute per IP/route. Errors use 429 RFC 9457 with Retry-After. The default rate limiter is **per process**; replace through its port when running multiple replicas.

An optional IdempotencyInterceptor currently protects registration. Supply Idempotency-Key of 8-128 safe characters; records are unique per actor/method/path/key. Request hashes are checked for equality, in-flight duplicates return 409, and completed responses replay. Schedule cleanup of expired IdempotencyRecord rows.

## Pino + OpenTelemetry + OpenObserve

Pino serves as the structured JSON log writer behind the existing JsonLogger, retaining secret redaction and request ALS correlation. The Node startup script preloads tracing.ts through --import, installing HTTP, Express and Prisma instrumentations. fs/dns tracing is disabled. When a span exists, traceId/spanId are captured in RequestContext and exported with log attributes.

Local OTLP endpoints:
- Traces: http://localhost:5080/api/default/v1/traces
- Logs: http://localhost:5080/api/default/v1/logs

OTEL_EXPORTER_OTLP_HEADERS is a comma-separated list of key=value pairs. When absent, the local profile may set OPENOBSERVE_USERNAME and OPENOBSERVE_PASSWORD; the tracing adapter creates the Authorization Basic header at startup. Explicit OTLP headers take precedence. The .env.example values are only for an isolated local environment. **Without OTEL_EXPORTER_OTLP_ENDPOINT no exporters are configured**, but Pino continues logging to stdout.

## Tests

~~~sh
pnpm lint
pnpm typecheck
pnpm build
pnpm test

# Separate database for integration tests:
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/nest_plantilla_test pnpm db:migrate
TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/nest_plantilla_test pnpm test
~~~

test/preset-system.test.ts covers UUID v7, Argon2id, env, scope AND and rate limit. test/preset-integration.test.ts runs only with TEST_DATABASE_URL and verifies transaction commit/rollback, registration -> outbox -> email -> verification -> login -> JWT -> refresh -> family revocation on reuse, plus scoped pagination. Run integration tests only against a disposable dedicated test database; never against production.
