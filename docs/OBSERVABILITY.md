# Observabilidad base (PR #3)

## Alcance

La plantilla arranca con una infraestructura **sin proveedores externos** que ofrece:
- Logs JSON escritos a stdout (info/debug/warn) y stderr (error).
- Contexto por petición aislado con `AsyncLocalStorage`.
- `X-Request-ID` validado o generado (UUID v4), propagado en respuesta y logs.
- Un evento `http.request.completed` por petición, incluso para 401/403/404/500;
  si la conexión termina antes de enviar la respuesta registra `outcome: aborted`
  y un código de **log** sintético 499.
- `GlobalExceptionFilter` registra `http.unhandled_exception` con stack interno
  para fallos 5xx, pero devuelve al cliente un RFC 9457 sin detalles técnicos.
- Guards AuthN adjuntan al contexto un actor ya verificado (`actorId`, `actorType`).

**Sin** OpenTelemetry SDK, OTLP, Jaeger, OpenObserve, Prometheus, Sentry, Redis,
Pino, Winston, ni almacenamiento de logs en BD o archivos. Los exportadores,
tracing distribuido, métricas y auditoría persistente se pueden implementar
después sin modificar los casos de uso.

## Configuración

```env
LOG_LEVEL=info
SERVICE_NAME=nest-plantilla
```

Los niveles válidos son `debug`, `info` (predeterminado), `warn`, `error`,
`silent`. `debug` incluye el nivel verbose de Nest; `fatal` se emite como
`error`. Los valores inválidos de `LOG_LEVEL` se tratan como `info`.

NestJS usa `JsonLogger` como su `LoggerService` mediante
`NestFactory.create(AppModule, { logger: jsonLogger })`. Los registros incluyen
`timestamp`, `level`, `service`, `message`, campos de evento y,
cuando existe, `requestId` y el actor autenticado. Los logs se recogen por
la plataforma de ejecución (Docker, Kubernetes, systemd, etc.).

`ObservabilityModule` registra un middleware global para todo HTTP, antes
de guards y controladores; no se usa un interceptor para logs de acceso, pues
los interceptores no cubren todos los rechazos de los guards.

## Ejemplo de petición

```http
GET /health HTTP/1.1
X-Request-ID: integration-job-42
```

Respuesta: `X-Request-ID: integration-job-42`

Ejemplo ilustrativo de salida JSON (sin datos de petición):
```json
{"timestamp":"2026-11-07T18:00:00.000Z","level":"info","service":"nest-plantilla","message":"http.request.completed","event":"http.request.completed","context":"RequestLoggingMiddleware","requestId":"integration-job-42","method":"GET","route":"/health","outcome":"completed","statusCode":200,"durationMs":3.23}
```

- El cliente puede proporcionar un ID de hasta 64 caracteres, con letras,
  dígitos, `_` y `-`, comenzando por alfanumérico.
- IDs duplicados, vacíos, peligrosos, malformados o excesivamente largos se
  **ignoran** y se reemplazan por un UUID. No se reflejan sin validar.
- Se usa la **ruta resuelta** (plantilla con parámetros, no URL real/query).
  Las rutas desconocidas aparecen como `unmatched`.
- El middleware usa tiempo monotónico y registra una sola vez tanto `finish`
  como `close`, sin doble evento en conexiones terminadas normalmente.

## Uso desde infraestructura

El logger de Nest está disponible con `new Logger('NombreDelServicio')`.
Los registros que emita dentro de una petición reciben `requestId`
automáticamente. Para registrar eventos estructurados, pasar un objeto:

```typescript
private readonly logger = new Logger('OutboundPaymentAdapter');

this.logger.log({ event: 'payment.provider.requested', provider: 'example' });
```

El `requestContext.current()` puede consultarse desde infraestructura
para acceder a `requestId`, al `actor` y, si algún adaptador de tracing lo
añade en el futuro, a `traceId` / `spanId`. **No se debe importar ALS,
NestJS ni logger en domain/application**. Mantener los errores esperados como
`Result<T,E>`, no convertirlos en excepciones para registrar logs.

Los fallos 500 producen un registro técnico con stack
(`http.unhandled_exception`) y uno de finalización HTTP
(`http.request.completed`); son eventos **diferentes**, no dos registros
de acceso. Solo las excepciones inesperadas necesitan stack.

`JsonLogger` admite las firmas variádicas de `LoggerService`:
el último argumento string de `log/warn/debug/verbose/fatal` se interpreta
como contexto y los parámetros adicionales se guardan sanitizados en
`params`. En `error`, se distingue el stack del contexto para no registrar
`"stack": "GlobalExceptionFilter"` cuando el framework añade su nombre.
Los errores anidados preservan `cause` y `code` con límites de profundidad.

## Seguridad y límites

- No registrar por defecto headers, cookies, query strings, request/response
  body, JWT ni API Keys.
- `JsonLogger` redacta nombres comunes como `password`, `token`,
  `authorization`, `apiKey`, `secret`, `headers`, `body`,
  y corta metadatos desmesurados o circulares; esto es **defensa adicional**,
  no una garantía contra secretos incluidos manualmente en cadenas.
- Los campos exactos `query`, `body`, `payload` y `headers` se redactan,
  pero `queryDurationMs`, `slowQueryCount` y `bodySize` se conservan
  como métricas legítimas. Compartir la misma referencia en dos ramas del
  payload no se interpreta como un ciclo.
- No utilizar IDs de usuarios, request IDs ni rutas con parámetros como
  etiquetas de métricas por su alta cardinalidad.
- El `requestId` sirve para correlación, pero **no es prueba de identidad**
  ni token de seguridad. Un cliente puede elegir un ID sintácticamente válido.
- `traceId` y `spanId` no se fabrican cuando no existe un trace real.
- El log de petición no es un registro de auditoría persistente: auditoría
  requiere su propio puerto, política de retención y garantías de escritura.
- En jobs/consumidores/CLI no existe contexto HTTP automáticamente: podrán
  establecer un contexto propio en un adaptador futuro.

## Pruebas

`test/observability.test.ts` comprueba el redactor, los niveles, la
validación de Request-ID y el aislamiento de ALS con peticiones concurrentes.
`test/observability-http.test.ts` levanta Nest y cubre respuestas 200,
401, 403, 404, 500, correlación concurrente, rutas parametrizadas y
desconexión antes de responder.
