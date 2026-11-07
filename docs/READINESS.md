# Readiness y ciclo de vida de la aplicación

## Liveness vs readiness

`GET /health` es un liveness simple y existente:
`200 { "status": "ok" }`, sin depender de PostgreSQL, Redis, APIs externas
o colas.

`GET /health/ready` se registra **únicamente** si el proyecto importa
`ReadinessModule.register({ checks: [...] })`. No existe en `AppModule`
de la plantilla por defecto: no simulamos conexiones ni devolvemos un falso
estado sano sin tener dependencias críticas reales.

| Estado | Código HTTP | Respuesta |
|---|---|---|
| Todos los checks devuelven true | 200 | `{"status":"ready"}` |
| Alguno devuelve false, falla, excede timeout o empieza el shutdown | 503 | RFC 9457 `NOT_READY` |
| No se registró ReadinessModule | 404 | Endpoint inexistente |

El cuerpo 503 no expone nombres de dependencias, hosts, credenciales,
mensajes técnicos ni detalles de fallos. El middleware global ya
registra la finalización de la petición con su código 503.

## Contrato y registro

`ReadinessCheckPort` es una clase abstracta de infraestructura con:
`name: string` y `check(signal: AbortSignal): Promise<boolean>`.
No debe depender de tipos del dominio ni devolver información sensible.

Ejemplo **ilustrativo para un proyecto con una base de datos real**:

```typescript
@Injectable()
class PostgresReadinessCheck extends ReadinessCheckPort {
  readonly name = 'postgres';

  constructor(private readonly connection: DatabaseConnection) {
    super();
  }

  async check(signal: AbortSignal): Promise<boolean> {
    // Implementación propia de tu DB; la llamada debe soportar cancelación
    // o disponer de un timeout interno adicional.
    return this.connection.ping({ signal });
  }
}

@Module({
  imports: [
    DatabaseModule,
    ReadinessModule.register({
      imports: [DatabaseModule],
      checks: [PostgresReadinessCheck],
      timeoutMs: 1000,
    }),
  ],
})
class ProductionAppModule {}
```

Este ejemplo no está incluido en la plantilla. No se instala
`@nestjs/terminus`, Prisma, Postgres, Redis, OpenTelemetry ni proveedores
adicionales. `ReadinessModule.register()` rechaza arrays vacíos.
Los checks se instancian por DI de Nest; si requieren servicios externos
deben ser exportados por módulos importados explícitamente.

## Timeout, fallos y recuperación

- Los checks se ejecutan en **paralelo**, cada uno con su propio timeout
  configurado (2000 ms por defecto, entre 1 y 30 000).
- Los checks pueden retornar `false` o rechazar una Promise. El servicio
  los traduce a `unavailable`; si exceden el límite, a `timeout`.
- El `AbortSignal` se cancela cuando vence el plazo, pero **las APIs
  subyacentes deben respetarlo**: `Promise.race` no puede detener por sí
  solo una consulta que ignora la señal.
- Los nombres de checks deben ser únicos y seguros; los mensajes de error
  no forman parte de la respuesta HTTP.
- Los checks NO se registran como proveedores globales. No hay un check
  ficticio "always ready".

## Shutdown

El bootstrap ya llama `app.enableShutdownHooks()` desde el PR #4.
Al recibir una señal de apagado, Nest ejecuta sus lifecycle hooks
y cierra el servidor y adaptadores de infraestructura.

`ReadinessService` implementa `BeforeApplicationShutdown`: al iniciarse
el apagado pasa a `not_ready` y deja de iniciar nuevas comprobaciones.
Las peticiones que todavía alcancen el endpoint durante el cierre reciben
503. Liveness se mantiene como comprobación simple hasta que el servidor
deje de aceptar tráfico.

En Kubernetes/Docker conviene coordinar el tiempo de gracia de terminación
con la duración de peticiones y las desconexiones de clientes. Esta plantilla
no impone demoras artificiales, preStop hooks ni semáforos globales.

## Pruebas

- `test/readiness.test.ts`: all healthy, false, error, timeout,
  cancelación cooperativa, validación de nombre/plazo y transición de shutdown.
- `test/readiness-http.test.ts`: endpoints HTTP reales con Nest,
  respuestas 200/503, RFC 9457 sin secretos, timeout y 404 por defecto.
