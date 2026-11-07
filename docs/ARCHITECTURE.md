# Arquitectura de Nest Plantilla

## Capas

```text
src/
├── app.module.ts              # composición de infraestructura
├── main.ts                    # bootstrap HTTP
├── shared/
│   ├── core/                  # Result<T,E>, utilidades absolutamente puras
│   ├── domain/auth/           # Principal, ResourcePolicy, AccessScope
│   ├── application/ports/     # UnitOfWorkPort
│   └── infrastructure/http/   # HttpResult, interceptors, filters, gates, swagger
└── modules/
    └── <feature>/
        ├── public.ts
        ├── <feature>.module.ts
        ├── domain/{entities,value-objects,policies,ports,errors}
        ├── application/{use-cases,services,ports}
        └── infrastructure/
            ├── http/{client,staff,partner-b2b,mappers}
            ├── persistence/{models,mappers}
            ├── adapters/
            └── webhooks/
```

No se crea ningún módulo de negocio hasta conocer sus requisitos. Los directorios del árbol de ejemplo se materializan solo si son necesarios.

## Contratos agnósticos

Puertos con `abstract class`, implementados y conectados mediante providers:
```typescript
@Module({
  providers: [
    { provide: UserRepositoryPort, useClass: PrismaUserRepository },
    { provide: PasswordHasherPort, useClass: Argon2PasswordHasherAdapter },
    {
      provide: CreateUserUseCase,
      useFactory: (users: UserRepositoryPort, passwords: PasswordHasherPort) =>
        new CreateUserUseCase(users, passwords),
      inject: [UserRepositoryPort, PasswordHasherPort],
    },
  ],
})
export class UsersModule {}
```
Este ejemplo **no es parte de la plantilla**: no existe ningún adapter ni puerto User todavía. Prisma/Sequelize y Argon2/bcrypt solo se instalan cuando se eligen para un proyecto concreto.

## Contrato UnitOfWork

- Si el callback devuelve `Result.ok`: COMMIT; al confirmarse, ejecutar hooks afterCommit; retornar ok original.
- Si devuelve `Result.err`: ROLLBACK explícito; descartar hooks; retornar exactamente el mismo err.
- Si se produce excepción técnica: ROLLBACK si es posible y **propagar la excepción original**. No contaminar errores tipados con DATABASE_CRASH.
- Al fallar afterCommit ya no se puede deshacer commit. Para entrega fiable, implementar Transactional Outbox en el proyecto.
- ALS/CLS es un detalle del adaptador; no se instala ni se presupone ORM alguno.

## Validación Zod y OpenAPI

NestJS 12 tiene integración Standard Schema nativa. Usar:
```typescript
// infrastructure/http/staff/schemas/create-order.schema.ts
export const CreateOrderDto = createZodDto(
  z.object({ code: z.string().min(1).meta({ description: 'Order code' }) }),
);
export type CreateOrderDto = ZodDtoOutput<typeof CreateOrderDto>;

// infrastructure/http/staff/staff-orders.controller.ts
@Post()
create(@Body({ schema: CreateOrderDto.schema }) dto: CreateOrderDto) {
  const input = OrderHttpMapper.toCreateInput(dto);
  return this.useCase.execute(input).then((r) => HttpResult.from(r, OrderErrorMapper.toProblemDetails, 201));
}
```
El pipe global valida entrada; `@nestjs/swagger` usa `~standard.jsonSchema` de Zod 4.2+. No llevar DTOs de Zod al caso de uso.

## Autenticación (AuthN)

`modules/auth` posee la identidad de usuarios y `modules/api-clients` posee la autenticación Machine-to-Machine. Los puertos son agnósticos y cada módulo se registra solo al aportar explícitamente un verificador de infraestructura. No se autoconfigura JWT, sesiones ni API Keys. Los guards producen un `Principal` confiable y siempre se ejecutan antes de Gates. Ver [AUTHENTICATION.md](AUTHENTICATION.md).

## Autorización por niveles

1. `@Authorize(permission, predicate)` + `GateGuard` comprueba permiso antes del Use Case. **Requiere** un guard de autenticación real por audiencia que asigne `request.principal`; no viene instalado.
2. `ResourcePolicy.authorize(actor, action, entity)` decide una acción usando una entidad cargada.
3. `ResourcePolicy.resolveScope(actor)` retorna `Result<AccessScope<Constraints>, AuthorizationError>`; el adapter de repositorio realiza intersección de filtros del usuario y Scope bajo AND lógico, nunca OR ni reemplazo permisivo.

## HTTP

Casos de uso retornan `Result`. Controladores devuelven `HttpResult.from(...)`; el interceptor global expone éxito o RFC 9457. El filtro global trata fallos no controlados, incluyendo fallos del framework, sin filtrar stack al cliente.

## Regla anti-boilerplate

Nada de `DomainService` para un único agregado, `ApplicationService` para un solo caso de uso, `RepositoryPort` sin persistencia requerida ni adapters vacíos. Validación HTTP, proveedores y servicios concretos residen en infraestructura.

## Módulo inicial authz

`src/modules/authz/public.ts` es la interfaz pública del módulo.

- **shared/domain/auth:** contrato `Principal`, `AuthorizationError`, `AccessScope`,
  `ResourcePolicy` y `PermissionPolicy.require` (puro, comparación exacta).
- **modules/authz/application:** `AuthorizeActionUseCase` verifica permiso;
  `AuthorizeResourceUseCase` aplica después `ResourcePolicy.authorize`;
  `ResolveAccessScopeUseCase` consulta `ResourcePolicy.resolveScope` solo tras verificar
  permiso. No hay excepciones de negocio, I/O, ni decoradores Nest en aplicación.
- **modules/authz/infrastructure/http:** `AuthzErrorMapper` convierte todos los
  errores tipados de autorización a HTTP 403 RFC 9457 con `ts-pattern.exhaustive()`.
- **modules/authz/authz.module.ts:** exporta use cases (factory providers) y
  `GateGuard`. Está importado por `AppModule`.

El `GateGuard` no se registra globalmente como `APP_GUARD`: eso lo ejecutaría
antes de los guards de autenticación configurados por audiencia. En controladores
futuros, configurar `@UseGuards(AudienceAuthGuard, GateGuard)` junto con
`@Authorize('resource.action')`. Authn carga y valida el principal en
`request.principal`; authz nunca autentica ni interpreta tokens. Un principal
ausente responde 401 y un permiso/predicado denegado provoca 403, ambos manejados
por el filtro global. Las rutas no anotadas permanecen públicas si no están
protegidas por un guard de authn.

**Advertencia anti-IDOR:** `AccessScope.unrestricted()` solo debe provenir de
una política que lo autorice explícitamente; `AccessScope.constrained({ ... })`
no es una autorización para ignorar filtros. La implementación de repositorios
debe intersectar condiciones de actor, tenant y filtros de usuario con `AND`.
Para leer una entidad, el caso de uso primero carga la entidad con una consulta
restringida, luego ejecuta `AuthorizeResourceUseCase` sobre ella. Nunca consultar
una entidad de otro tenant sin autorización.

**Sin proveedores instalados:** no hay roles predefinidos, acceso por wildcard,
`JwtService`, servicios de permisos externos, base de datos, usuarios simulados
ni políticas de negocio genéricas para recursos inexistentes.
