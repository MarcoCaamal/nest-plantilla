# Configuración tipada y adaptadores de sistema

## Bootstrap seguro

El arranque valida las variables del entorno con Zod 4 **antes** de ejecutar `NestFactory.create()`.
No se instala `@nestjs/config`, `dotenv` ni proveedor de secretos. Usa el entorno
del contenedor, de systemd o `node --env-file=.env dist/main.js` si quieres
cargar un archivo de entorno manualmente.

| Variable | Tipo | Por defecto | Restricciones |
|---|---|---|---|
| `NODE_ENV` | enum | `development` | `development`, `test`, `production` |
| `PORT` | entero | `3000` | entre 1 y 65535 |
| `LOG_LEVEL` | enum | `info` | `debug`, `info`, `warn`, `error`, `silent` |
| `SERVICE_NAME` | string | `nest-plantilla` | 1–100 caracteres: letras, dígitos, punto, guion o guion bajo |

`baseEnvSchema` está en `shared/infrastructure/config/env.schema.ts`.
`parseEnv()` es una función de frontera técnica: lanza `EnvironmentValidationError`
solo durante el arranque. Los mensajes de error incluyen nombre de variable
y código de validación, **no incluyen valores de variables**, que pueden ser
secretos. El error se registra como `bootstrap.failed` y el proceso
termina con un código distinto de cero, sin levantar HTTP.

```typescript
import { z } from 'zod';
import { baseEnvSchema } from '@/shared/infrastructure/config/env.schema';
import { parseEnv, AppConfig } from '@/shared/infrastructure/config/app-config';

const envSchema = baseEnvSchema.extend({
  EXTERNAL_API_URL: z.url(),
  FEATURE_ENABLED: z.enum(['true', 'false']).transform((value) => value === 'true'),
});

const env = parseEnv(process.env, envSchema);
// env.PORT: number, env.FEATURE_ENABLED: boolean
const config = new AppConfig(env);
```

En un proyecto derivado, cambia el bootstrap para analizar el schema extendido
y luego registra `ConfigModule.register(config)` dentro del módulo raíz de
composición. No leer `process.env` en controllers, aplicación, dominio ni
adaptadores después de la validación. Para credenciales con procedencia distinta,
ajusta el lector de la frontera, no las capas internas.

El logger JSON recibe `LOG_LEVEL` y `SERVICE_NAME` a través de
`jsonLogger.configure(...)`, a partir de la configuración validada. No lee
`process.env` de forma independiente.

## Ciclo de vida

El bootstrap registra `app.enableShutdownHooks()`. Al recibir señales de
terminación soportadas por NestJS, el framework cierra los providers con hooks
de ciclo de vida registrados, útil cuando un proyecto agregue conexiones
a bases de datos, colas o Redis. Se desactiva el encabezado de Express
`X-Powered-By`.

`GET /health` permanece como **liveness** técnico sin dependencias externas.
No existe todavía `GET /health/ready`: responder `ready` sin comprobar
dependencias reales podría engañar a Kubernetes. Cuando un proyecto añada
recursos externos, podrá incorporar un `ReadinessCheckPort` orientado a su
necesidad y un controller aparte sin alterar el health existente.

## Puertos Clock/IDs

En `shared/application/ports` existen `ClockPort` e `IdGeneratorPort`
con una única operación cada uno. La plantilla contiene adaptadores opcionales
`SystemClock` y `UuidGenerator` bajo `shared/infrastructure/system`;
no se registran globalmente porque ningún caso de uso base necesita todavía
un reloj ni un ID.

```typescript
@Module({
  providers: [
    { provide: ClockPort, useClass: SystemClock },
    { provide: IdGeneratorPort, useClass: UuidGenerator },
  ],
  exports: [ClockPort, IdGeneratorPort],
})
export class MyFeatureAdaptersModule {}
```

Para pruebas, basta reemplazarlos por clases `FakeClock` y
`FakeIdGenerator` deterministas. Los aggregates crean sus IDs
**antes** de la persistencia. El tipo `string` permite UUID v4/v7 o ULID
según la decisión del proyecto, sin añadir una dependencia a la plantilla.
