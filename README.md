# Nest Plantilla

Base de NestJS 12+ con TypeScript 6, DDD táctico pragmático y Clean/Hexagonal. **Agnóstica a base de datos, ORM, hashing, caché, colas y proveedores externos**.

## Requisitos

- Node.js 24+
- pnpm 10+

## Inicio

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm start
```

Pruebas HTTP: `GET http://localhost:3000/health`; Swagger: `http://localhost:3000/docs`.

Desarrollo: `pnpm dev`. Config opcional: `PORT=3000`.

## Qué hay y qué no

Hay `Result<T,E>`, `Principal`, `ResourcePolicy`, `AccessScope`, `UnitOfWorkPort`, `HttpResult`, RFC 9457, `GateGuard`, helper Zod 4/Standard Schema, Swagger y reglas de arquitectura.

**No hay** ORM, conexión a base de datos, hashes de contraseña, API keys, JWT, Redis, colas, webhook dispatcher ni módulos de negocio falsos. Se añaden puertos cuando exista una necesidad de dominio y adaptadores cuando se elija una tecnología. El health endpoint únicamente verifica que el proceso está vivo.

Lee [AGENTS.md](AGENTS.md) y [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) antes de implementar funciones.

**Package manager: pnpm exclusivamente.**
