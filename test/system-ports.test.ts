import { describe, expect, it } from 'vitest';
import { ClockPort } from '@/shared/application/ports/clock.port';
import { IdGeneratorPort } from '@/shared/application/ports/id-generator.port';
import { SystemClock } from '@/shared/infrastructure/system/system-clock';
import { UuidGenerator } from '@/shared/infrastructure/system/uuid-generator';

describe('system-agnostic ports', () => {
  it('can use deterministic test doubles without changing a use case', () => {
    class FakeClock extends ClockPort {
      now(): Date { return new Date('2030-01-02T00:00:00.000Z'); }
    }
    class FakeIdGenerator extends IdGeneratorPort {
      generate(): string { return 'entity-01'; }
    }
    function createEntity(clock: ClockPort, ids: IdGeneratorPort) {
      return { id: ids.generate(), occurredAt: clock.now() };
    }
    expect(createEntity(new FakeClock(), new FakeIdGenerator())).toEqual({
      id: 'entity-01', occurredAt: new Date('2030-01-02T00:00:00.000Z'),
    });
  });

  it('ships optional standard adapters without external providers', () => {
    expect(new SystemClock().now()).toBeInstanceOf(Date);
    expect(new UuidGenerator().generate()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});
