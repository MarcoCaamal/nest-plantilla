# Eventos de dominio y transacciones

## Objetivo

Los eventos de dominio expresan hechos que ya ocurrieron, sin depender
de NestJS, HTTP, broker, ORM o base de datos. `DomainEvent` vive en
`shared/domain/domain-event.ts`:

```typescript
interface DomainEvent {
  readonly eventName: string;
  readonly aggregateId: string;
  readonly occurredAt: string; // instante ISO 8601 inmutable
}
```

El ID y timestamp se producen en el dominio o factory con los puertos
`IdGeneratorPort` y `ClockPort`, según requiera el proyecto; no en INSERT.

## Recolección en agregados (composición)

`DomainEventBuffer<TEvent>` aporta `record`, `peek` y `clear`.
La clase no envía eventos, no agrega listeners ni impone una clase base
`AggregateRoot` a todos los módulos.

```typescript
interface OrderConfirmed extends DomainEvent {
  readonly eventName: 'order.confirmed';
}

class Order {
  private readonly pending = new DomainEventBuffer<OrderConfirmed>();

  confirm(now: string): void {
    // aplicar reglas y mutar estado de Order según su dominio
    this.pending.record({
      eventName: 'order.confirmed',
      aggregateId: this.id,
      occurredAt: now,
    });
  }

  getUncommittedEvents(): readonly OrderConfirmed[] {
    return this.pending.peek(); // copia que NO elimina eventos
  }

  acknowledgeCommittedEvents(): void {
    this.pending.clear();
  }
}
```

Las propiedades del evento son `readonly` y la cabecera queda
congelada en runtime; los subobjetos de eventos especializados deben
ser valores inmutables. El `occurredAt` es un string ISO y no un
`Date` mutable. El buffer no valida identificadores ni hace serialización:
esas son decisiones del dominio y del adaptador.

## Integración con UnitOfWork

El `UnitOfWorkPort` existente controla **commit/rollback** y
callbacks `afterCommit`. Agregamos dos puertos opcionales:

- `TransactionalEventOutboxPort.append(events)`: persistir eventos en la
  **misma transacción** de la escritura del agregado. El adaptador
  concreto (Postgres, MariaDB, etc.) debe compartir el contexto
  transaccional y garantizar atomicidad; el tipo por sí solo no garantiza eso.
- `DomainEventPublisherPort.publish(events)`: transportar eventos hacia
  otros procesos. No participa automáticamente en la transacción.
  Se puede usar desde un worker de outbox, con retries, deduplicación,
  confirmaciones, monitoreo e idempotencia implementadas por el proyecto.

Flujo ilustrativo, **solo al implementar persistencia real**:

```typescript
const pendingEvents = order.getUncommittedEvents();

const result = await unitOfWork.runInTransaction(async () => {
  await ordersRepository.save(order);
  await transactionalOutbox.append(pendingEvents);
  return Result.ok(order.id);
});

if (result.ok) {
  // No limpiar dentro del callback transaccional; el commit puede fallar.
  order.acknowledgeCommittedEvents();
}
```

Si el callback devuelve `Result.err` o falla una escritura, se hace rollback
de ambos y se **descarta o recarga el agregado en memoria** antes de reutilizarlo.
Sus eventos pendientes no son un reflejo fiable del estado persistido tras rollback.

`afterCommit` sirve solo para tareas best-effort: si el proceso cae entre
commit y callback, puede perderse la notificación. Si falla después de commit,
la transacción **ya no se puede revertir**. Para eventos importantes se usa
Transactional Outbox en el mismo commit, y luego un dispatcher independiente.

No existe publicador `NoOp`, event bus global, suscripción automática, ni
implementación de outbox que finja garantías transaccionales. Los puertos
permanecen sin proveedores hasta que un módulo lo requiera.

## Pruebas de conformidad

`test/domain-events.test.ts` incluye un fake transaccional **solo para tests**
que cubre:

- El evento sigue disponible después de `peek()`, hasta reconocer commit.
- Commit con outbox atómico.
- `Result.err` descarta outbox y callbacks de afterCommit.
- Excepción inesperada conserva la excepción original y hace rollback.
- Transacción anidada comparte contexto y no puede confirmar un
  resultado en estado rollback-only.
- Fallo de `afterCommit` no revierte escritura ya confirmada.

Cada adaptador real de `UnitOfWorkPort` debe repetir estas pruebas con
la base de datos real, idealmente mediante Testcontainers.
