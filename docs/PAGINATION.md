# Listados seguros, paginación y scopes

## Contratos reutilizables

`shared/core/pagination.ts` contiene exclusivamente tipos, sin NestJS,
HTTP, Zod ni ORM:

- `PageQuery`: `{ kind: 'page', page, limit }`.
- `CursorQuery`: `{ kind: 'cursor', cursor?, limit }`.
- `PageResult<T>`: `items`, `page`, `limit`, `total`, `totalPages`.
- `CursorResult<T>`: `items`, `limit`, `hasMore`, `nextCursor?`.
- `Paginated<T>`: unión discriminada de `PageResult<T>` y `CursorResult<T>`.

La paginación por cursor **no exige `COUNT(*)`**. El token es opaco:
su serialización, firma, vigencia, integridad y estabilidad corresponden
al adaptador/servicio concreto cuando se implementa. No colocar información
secreta en un cursor sin cifrar.

## Validación HTTP

`shared/infrastructure/http/schemas/pagination-query.schema.ts` expone
`PageQueryDto`, `CursorQueryDto` y `PaginationHttpMapper`.

| Parámetro | Valor por defecto | Restricción |
|---|---|---|
| `page` | `1` | entero entre 1 y 1 000 000 |
| `limit` | `20` | entero entre 1 y **100** |
| `cursor` | omitido | cadena no vacía, sin espacios alrededor, de hasta 2048 caracteres |

Zod 4 transforma query params numéricos y aplica defaults mediante su
`Standard Schema`. Una ruta real de Nest puede usar:

```typescript
const OrdersQueryDto = PageQueryDto.schema.extend({
  status: z.enum(['OPEN', 'CLOSED']).optional(),
});

@Get()
async list(@Query({ schema: OrdersQueryDto }) dto: z.output<typeof OrdersQueryDto>) {
  const pagination = PaginationHttpMapper.toPageQuery(dto);
  // Pasar filtros propios y scope autorizado a un use case.
}
```

No creamos un DTO ligado a un negocio, ni un controlador de listado
ficticio en la plantilla. El test HTTP confirma validación y coerción de
`PageQueryDto` / `CursorQueryDto` con Nest real.

## Ant-IDOR: un scope obligatorio

`shared/domain/auth/scoped-list-query.ts` define:
```typescript
export interface ScopedListQuery<TConstraints, TFilters, TPagination extends PaginationQuery> {
  readonly scope: AccessScope<TConstraints>;
  readonly filters: Readonly<TFilters>;
  readonly pagination: TPagination;
}
```

Un ejemplo **ilustrativo** de puerto en `modules/orders/domain/ports` sería:

```typescript
abstract class OrdersRepositoryPort {
  abstract list(
    query: ScopedListQuery<OrderScopeConstraints, OrdersFilters, PageQuery>,
  ): Promise<PageResult<Order>>;
}
```

El caso de uso consulta `ResourcePolicy.resolveScope(principal)` **antes**
de ejecutar `list`; si devuelve `Result.err`, no consulta datos.
Si devuelve `Result.ok(scope)`, el caso de uso construye:

```typescript
await ordersRepository.list({
  scope: scopeResult.value,
  filters: { status: input.status },
  pagination: input.pagination,
});
```

El tipo obliga a suministrar `scope` para ese puerto, pero **no puede
demostrar por sí solo que una consulta SQL/ORM esté correctamente filtrada**.
La implementación concreta siempre debe intersectar:

```text
WHERE (restricciones_del_scope) AND (filtros_del_cliente)
```

Jamás usar `OR`, reemplazar un scope limitado por el filtro recibido o
construir un `AccessScope.unrestricted()` como fallback de un error.
El único origen legítimo de `UNRESTRICTED` es una política que lo autorice.

Por seguridad, la paginación se evalúa después de restringir el conjunto
visible. El total de registros de un `PageResult` pertenece al scope
autorizado, no a la tabla completa. El orden debe ser determinista para
que página y cursor sean estables; índices, offset, keyset y combinación de
filtros dependen del adaptador de base de datos.

## Por qué no creamos un repositorio genérico

Cada módulo tiene requisitos de filtros, permisos y cardinalidad distintos.
Un puerto de repositorio global asumiría demasiadas reglas de negocio.
`ScopedListQuery` y `Paginated<T>` proporcionan tipos compartidos sin
imponer un `GenericRepository<T>` ni instalar ninguna base de datos.

Los tests usan repositorios in-memory **solo en pruebas** para comprobar
que filtros elegidos por el cliente no amplían un scope restringido.
