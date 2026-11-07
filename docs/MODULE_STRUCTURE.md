# Arquitectura concreta del preset: Auth, Users e IAM

Esta estructura corresponde a la rama `preset/opinionated`; las abstracciones del `main` permanecen agnósticas a tecnología. Es el árbol real del código, no un esquema hipotético.

## Responsabilidad por bounded context

| Módulo | Propiedad | HTTP |
| --- | --- | --- |
| `auth` | Verificación de identidad, credenciales, Argon2id, sesiones/refresh, JWT, registro, confirmación de email y recuperación de cuenta | `/auth/*` |
| `users` | Usuario genérico, `displayName`, estado, perfil propio, creación/consulta de cuentas y asignación/revocación de roles del usuario | `/me`, `/backoffice/users/*` |
| `iam` | Roles, catálogo inmutable de permisos y vinculación de permisos a roles | `/backoffice/roles/*`, `/backoffice/permissions/*` |

No se crean `StaffUser` ni `BackofficeUser`: cada cuenta es un `User`, y `admin` es un rol normal vinculado mediante `UserRole`. Los módulos solo importan contratos públicos del otro bounded context (`public.ts`); el lint de `eslint-plugin-boundaries` lo comprueba.

## Árbol verificado

```text
src/modules/auth
├── application
│   ├── ports
│   │   ├── account-token-repository.port.ts
│   │   ├── opaque-token-generator.port.ts
│   │   ├── password-hasher.port.ts
│   │   ├── session-repository.port.ts
│   │   ├── token-issuer.port.ts
│   │   └── user-credential-verifier.port.ts
│   ├── services
│   │   └── session-token.service.ts
│   ├── types.ts
│   └── use-cases
│       ├── authenticate-user.use-case.ts
│       ├── loginWithPassword.use-case.ts
│       ├── refresh-session.use-case.ts
│       ├── register.use-case.ts
│       ├── request-password-reset.use-case.ts
│       ├── reset-password.use-case.ts
│       ├── revoke-session.use-case.ts
│       └── verify-email.use-case.ts
├── auth.module.ts
├── auth-preset.module.ts
├── domain
│   ├── entities
│   │   └── session.entity.ts
│   └── errors
│       └── auth-domain.error.ts
├── infrastructure
│   ├── auth-infrastructure.module.ts
│   ├── http
│   │   ├── guards
│   │   │   └── user-authentication.guard.ts
│   │   └── public
│   │       ├── auth.controller.ts
│   │       ├── auth-error.mapper.ts
│   │       └── schemas
│   │           └── auth.schema.ts
│   ├── persistence
│   │   ├── prisma-account-token.repository.ts
│   │   └── prisma-session.repository.ts
│   └── security
│       ├── argon2-password-hasher.adapter.ts
│       ├── jwt-token.adapter.ts
│       ├── jwt-user-credential-verifier.adapter.ts
│       └── opaque-token.adapter.ts
├── jwt-authn.module.ts
└── public.ts
src/modules/users
├── application
│   ├── ports
│   │   └── user-repository.port.ts
│   └── use-cases
│       ├── backoffice
│       │   ├── assign-user-roles.use-case.ts
│       │   ├── change-user-status.use-case.ts
│       │   ├── create-user.use-case.ts
│       │   ├── get-user-detail.use-case.ts
│       │   └── list-users.use-case.ts
│       └── self
│           ├── change-my-password.use-case.ts
│           ├── get-my-profile.use-case.ts
│           └── update-my-profile.use-case.ts
├── domain
│   ├── entities
│   │   ├── user.entity.ts
│   │   └── user-scope.ts
│   ├── errors
│   │   └── user.error.ts
│   └── policies
│       └── user-resource.policy.ts
├── infrastructure
│   ├── http
│   │   ├── backoffice
│   │   │   ├── backoffice-users.controller.ts
│   │   │   ├── schemas
│   │   │   │   └── users.schema.ts
│   │   │   └── users-error.mapper.ts
│   │   └── self
│   │       ├── me.controller.ts
│   │       └── schemas
│   │           └── me.schema.ts
│   └── persistence
│       ├── prisma-user.repository.ts
│       └── users-persistence.module.ts
├── public.ts
└── users.module.ts
src/modules/iam
├── application
│   ├── ports
│   │   ├── permission-repository.port.ts
│   │   └── role-repository.port.ts
│   └── use-cases
│       ├── create-role.use-case.ts
│       ├── delete-role.use-case.ts
│       ├── list-permissions.use-case.ts
│       ├── list-roles.use-case.ts
│       ├── set-role-permissions.use-case.ts
│       └── update-role.use-case.ts
├── domain
│   ├── entities
│   │   ├── permission.entity.ts
│   │   └── role.entity.ts
│   └── errors
│       └── iam.error.ts
├── iam.module.ts
├── infrastructure
│   ├── http
│   │   └── backoffice
│   │       ├── backoffice-permissions.controller.ts
│   │       ├── backoffice-roles.controller.ts
│   │       ├── iam-error.mapper.ts
│   │       └── schemas
│   │           └── roles.schema.ts
│   └── persistence
│       ├── iam-persistence.module.ts
│       ├── prisma-permission.repository.ts
│       └── prisma-role.repository.ts
└── public.ts

44 directories, 75 files
```

La estructura contiene algunos adaptadores de apoyo legítimos no enumerados en el árbol mínimo original: `RegisterUseCase`, `VerifyEmailUseCase`, `AccountTokenRepositoryPort`, `OpaqueTokenGeneratorPort`, `SessionTokenService`, `PrismaPermissionRepository` y módulos Nest de composición. No son directorios de relleno ni responsabilidades duplicadas.

## Restricciones de capas

- **domain:** interfaces de entidades, reglas y errores de negocio; sin NestJS, Prisma, Zod ni acceso a infraestructura.
- **application:** casos de uso, coordinación con `UnitOfWorkPort` y puertos de repositorio (`application/ports`). Resultados esperados como `Result<T,E>`, nunca excepciones de negocio.
- **infrastructure:** Prisma, Argon2id, `jose`, HTTP, guards, Zod y wiring DI. DTOs solo en controladores de audiencia.
- **Permisos:** `/backoffice/permissions` dispone exclusivamente de los dos métodos GET; el catálogo se provisiona por el seed y se asigna a roles en `iam`.
- **Cuenta genérica:** `/me` no exige privilegios administrativos y nunca entrega `passwordHash`. El cambio de contraseña revoca todas las sesiones del usuario. `/backoffice/*` exige Bearer + GateGuard con permisos actuales obtenidos de PostgreSQL.
- **Migraciones:** `20261107230000_add_user_display_name` añade `users.display_name` nullable. No cambia el esquema de roles/permisos ni las credenciales previas. Requiere `pnpm db:migrate` y `pnpm db:generate` en despliegues existentes.

## Pruebas

`test/preset-architecture.test.ts` comprueba los archivos obligatorios y la propiedad de los controladores; `pnpm lint` impide dependencias de capas prohibidas. `test/preset-http.test.ts` y `test/preset-integration.test.ts` ejercitan sesiones, JWT, perfil, usuarios, roles y permisos con PostgreSQL real bajo `TEST_DATABASE_URL`.
