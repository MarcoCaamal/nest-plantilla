# Nest Plantilla — reglas no negociables

Este repositorio es una plantilla **agnóstica a proveedores** de NestJS 12+, TypeScript estricto y DDD táctico pragmático con Clean/Hexagonal. **Usar exclusivamente pnpm**.

## Dependencias y estructura
- `shared/core`: no importa dependencias; contiene tipos y utilidades puras como `Result`.
- `shared/domain`: solo importa `shared/domain` y `shared/core`. No NestJS, Zod, Node API, ORM, HTTP ni infraestructura.
- `modules/<feature>/domain`: importa solo su dominio, `shared/core`, `shared/domain`. Entidades, políticas, servicios puros y puertos de repositorio.
- `application`: importa su dominio/aplicación y `shared/*` agnóstico; nunca ORM, NestJS o HTTP. Los casos de uso NO llevan @Injectable, conectar con factory providers en módulos.
- `infrastructure`: implementa adaptadores, HTTP y wiring DI. Controladores separados por audiencia `client`, `staff`, `partner-b2b`; cada audiencia con seguridad y schemas propios.
- Otros módulos solo consumen el `public.ts` autorizado, nunca archivos internos.

## Errores y transacciones
- Los errores esperados retornan `Result<T,E>`; NO usar `throw` para negocio en domain/application.
- El caso de uso retorna `Result`; `HttpResult.from` mapea a success o RFC 9457 con `ts-pattern.exhaustive()` en ErrorMapper.
- El interceptor HTTP traduce el envelope. Controladores no lanzan `HttpException`.
- `UnitOfWorkPort`: `Result.ok` = commit + afterCommit; `Result.err` = rollback y mismo err; excepciones técnicas = rollback y excepción original. Hooks después de commit no garantizan entrega: usar outbox opcional al necesitarlos.

## Reglas de modelado
- Puertos son `abstract class` con DI nativa, no Symbol + interface redundantes.
- Repositorios reciben/devuelven agregados; mappers estáticos entre dominio y ORM.
- IDs y timestamps de negocio nacen en factories de entidades, no desde INSERT; timestamps ORM son técnicos.
- DomainService solo para lógica síncrona pura que requiere 2+ entidades; AppService solo si 2+ casos de uso comparten I/O.
- AuthN: guard de usuario Bearer y guard M2M API Key, en módulos separados. Ambos verifican por puertos y producen Principal inmutable; usar guard AuthN ANTES de GateGuard. Sin adaptadores preinstalados.
- AuthZ: Principal inmutable; Gates HTTP; ResourcePolicy en dominio; listados restringidos por AccessScope + filtros AND (anti-IDOR).

## Validación y adaptadores
- Zod 4 + Standard Schema nativo de Nest 12; schema en `infrastructure/http/<audiencia>/schemas`; nunca Zod en domain/application.
- Usar `.meta()` y `createZodDto`, `@Body({schema})`, `StandardSchemaValidationPipe`. Los HttpMappers convierten DTOs a inputs planos.
- No instalar de inicio Prisma, Sequelize, TypeORM, Postgres, Redis, Argon2, bcrypt, BullMQ, JWT provider, ni SDKs de terceros. Instalar adaptadores solo al necesitarlos. No implementar adapters de mentira.
- No Event Sourcing, buses CQRS complejos ni God Modules de integraciones.

## Protocolo al implementar
1. Ubicar archivos por capa; incorporar solo los necesarios.
2. Dominio: factories, errores discriminados, puertos, políticas cuando correspondan.
3. Aplicación: casos de uso, Result, UnitOfWorkPort.
4. Infraestructura: schemas Zod, HttpMapper, ErrorMapper exhaustivo, controladores por audiencia, adaptadores concretos opcionales.
5. Tests, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

No sacrificar simplicidad por una arquitectura decorativa. Ver `docs/ARCHITECTURE.md`.
