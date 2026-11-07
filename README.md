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

Hay `Result<T,E>`, `Principal`, `ResourcePolicy`, `AccessScope`, `UnitOfWorkPort`, `HttpResult`, RFC 9457, `GateGuard`, autenticación de usuarios y M2M agnóstica mediante puertos/guards, helper Zod 4/Standard Schema, Swagger y reglas de arquitectura.

**No hay** ORM, conexión a base de datos, hashes de contraseña, gestión real de API keys, emisión/verificación JWT, Redis, colas, webhook dispatcher ni módulos de negocio falsos. Se añaden puertos cuando exista una necesidad de dominio y adaptadores cuando se elija una tecnología. El health endpoint únicamente verifica que el proceso está vivo.

Lee [AGENTS.md](AGENTS.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) y [docs/AUTHENTICATION.md](docs/AUTHENTICATION.md) antes de implementar funciones.

**Package manager: pnpm exclusivamente.**

## Módulo inicial de autorización (authz)

`src/modules/authz` expone tres casos de uso agnósticos desde `public.ts`:
`AuthorizeActionUseCase` (permiso), `AuthorizeResourceUseCase` (permiso + política de entidad)
y `ResolveAccessScopeUseCase` (permiso + alcance de lectura). Todos devuelven `Result`,
sin I/O, sin `@Injectable()` en aplicación y sin ORM/JWT/Redis.

`AuthzModule` registra los casos de uso con factory providers y exporta `GateGuard`.
`@Authorize('projects.read')` define el permiso; el guard se activa explícitamente
**después de un guard de autenticación real**, que debe asignar `request.principal`:

```ts
// Ejemplo para un controlador futuro, no viene instalado ClientAuthGuard.
@UseGuards(ClientAuthGuard, GateGuard)
@Controller('projects')
export class ProjectsController {
  @Get()
  @Authorize('projects.read')
  list(@CurrentPrincipal() principal: Principal) {
    // El caso de uso resuelve AccessScope y el repositorio lo combina con AND.
  }
}
```

Se evita instalar `GateGuard` como `APP_GUARD`: Nest ejecuta los guards globales
antes que los guards de autenticación de cada controlador. Sin principal, una
ruta protegida responde **401**; sin permiso o al fallar un predicado, **403**.
Las excepciones técnicas del guard se traducen a RFC 9457 por el filtro global.
Los casos de uso devuelven `Result.err`, que puede mapearse con
`HttpResult.from(result, AuthzErrorMapper.toProblemDetails)`.

**Reglas de seguridad:** los permisos se comparan exactamente, ningún rol concede
permisos de forma implícita; una política denegada nunca se convierte en acceso sin
restricciones. En listados, el adapter de repositorio debe aplicar `AccessScope`
mediante un `AND` con filtros externos (nunca `OR` ni reemplazo de filtros).
No se incluye autenticación ni mecanismos para calcular o persistir permisos;
el adaptador de authn proporcionará un `Principal` confiable.
