# Autenticación agnóstica (AuthN) y autorización (AuthZ)

## Estado real de la plantilla

La plantilla proporciona **contratos**, casos de uso, guards HTTP y un protocolo común de identidad.
**No contiene ningún verificador operativo**, ni credenciales, usuarios, base de datos, hashing,
gestor de sesiones, JWT, Redis o servicio externo. `AppModule` puede arrancar sin ellos.

| Audiencia | Entrada HTTP | Caso de uso | Puerto del verificador |
| --- | --- | --- | --- |
| Humana (app/ops) | `Authorization: Bearer <credential>` | `AuthenticateHumanUseCase` | `HumanCredentialVerifierPort` |
| M2M (B2B) | `X-API-Key: <credential>` | `AuthenticateApiClientUseCase` | `ApiKeyVerifierPort` |

Ambos casos de uso retornan `Result<Principal, AuthenticationError>` (HUMAN o MACHINE).
Sus atributos son claims **planos/JSON-like ya validados y autorizados por el verificador**.
La aplicación crea un snapshot inmutable antes de exponerlo a políticas y Gates.
Los IDs, roles y permisos **nunca se construyen desde el cuerpo, query o header
de una petición sin verificar**.

## Conectar un adaptador real en un proyecto derivado

Implementa el puerto correspondiente desde infraestructura. Un adaptador JWT puede utilizar
cualquier biblioteca, JWKS o servicio de identidad; uno de sesiones puede consultar un
repositorio. No impongas un método de verificación dentro del Caso de Uso.

```typescript
// Ejemplo ilustrativo, NO existe JwtVerifierAdapter en este template.
@Module({
  imports: [
    AuthzModule,
    AuthModule.register({
      verifier: { provide: HumanCredentialVerifierPort, useClass: JwtVerifierAdapter },
      // imports: [SecretsModule, SessionModule], // solo si tu adaptador los necesita
    }),
  ],
  controllers: [StaffOrdersController],
})
export class OrdersModule {}
```

El puerto `HumanCredentialVerifierPort.verify(credential)` debe devolver un
`HumanPrincipal` auténtico; para máquina, `ApiKeyVerifierPort.verify(apiKey)`
devuelve `MachinePrincipal`. Las clases de guard son exportadas por los
módulos dinámicos, pero **no se registran globalmente** ni se inyectan
verificadores falsos en producción.

```typescript
@Controller('ops/orders')
@UseGuards(HumanAuthenticationGuard, GateGuard) // orden obligatorio
export class StaffOrdersController {
  @Get()
  @Authorize('orders:read')
  list(@CurrentPrincipal() principal: HumanPrincipal) { /* ... */ }
}

@Controller('b2b/orders')
@UseGuards(ApiKeyAuthenticationGuard, GateGuard)
export class PartnerOrdersController {
  @Get()
  @Authorize('orders:read')
  list(@CurrentPrincipal() principal: MachinePrincipal) { /* ... */ }
}
```

En tests puedes sustituir cada puerto con un fake in-memory. Eso no significa que
las rutas protegidas queden operativas en `AppModule` sin configurar un verificador.

## Errores y fallos técnicos

- Falta o invalidez de credenciales: `Result.err(AuthenticationError)` → 401 RFC 9457.
- Identidad autenticada pero sin permiso del Gate: 403 RFC 9457.
- Proveedor caído, error de programación o fallo de red: excepción técnica no capturada
  como `Result.err`; `GlobalExceptionFilter` responde 500 genérico y conserva
  stack trace interno.
- Un guard solo lanza `AuthenticationHttpException` en la frontera de protocolo
  de Nest para interrumpir el handler; no hay `throw` de negocio en aplicación/dominio.
- En errores 401 el cuerpo no divulga si un usuario, clave o sesión existe;
  errores internos distintos pueden compartir el código público `AUTHENTICATION_FAILED`.
- El Bearer guard agrega `WWW-Authenticate: Bearer realm="api"`.
- Nunca se aceptan Bearer y X-API-Key simultáneamente en una ruta protegida.

## Responsabilidades de un verificador de producción

El verificador humano debe comprobar autenticidad de la credencial, firma o
prueba criptográfica, expiración, emisor/audiencia, integridad, revocación si
corresponde y estado de identidad. Debe recuperar o validar de forma autoritativa
los permisos y tenant IDs; no confiar en claims o roles arbitrarios del cliente.
Para JWT, fijar algoritmo permitido y evitar aceptar tokens sin firma.

El verificador M2M debe validar la clave sin exponer su contenido (hashing
con mecanismo seguro, comparación resistente a timing, estado, expiración,
revocación y scopes), además de aplicar rotación y rate limiting cuando se
implemente el módulo con persistencia. No registrar API keys ni Bearer tokens
en logs o en errores.

El `GateGuard` necesita un `Principal` creado por un guard de AuthN: la simple
anotación `@Authorize` no equivale a validar un token. Para evitar rutas
accidentalmente públicas, proteger explícitamente cada controlador de audiencia.
Las `ResourcePolicy` y `AccessScope` siguen siendo obligatorias para
autorizar recursos individuales y filtrar listados sin IDOR.

## Lo que todavía no incluye

Login con contraseña, alta de usuarios, hashing Argon2/bcrypt, recuperación,
refresh token, revocación, rotación de API Keys, rate limiting, session store,
auditoría de identidad y middleware de cookies/CSRF. Esas decisiones dependen
del modelo concreto de identidades y de los adaptadores seleccionados.
No se crea boilerplate para ellas hasta definir requisitos.
