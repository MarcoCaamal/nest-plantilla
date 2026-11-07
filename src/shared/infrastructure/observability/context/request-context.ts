import { AsyncLocalStorage } from 'node:async_hooks';
import type { PrincipalType } from '@/shared/domain/auth/principal';

/** Transport-level correlation data. Never keep raw headers, bodies or credentials here. */
export interface RequestContext {
  readonly requestId: string;
  readonly actor?: Readonly<{ id: string; type: PrincipalType }>;
  readonly traceId?: string;
  readonly spanId?: string;
}

type MutableRequestContext = {
  -readonly [K in keyof RequestContext]: RequestContext[K];
};

class RequestContextStorage {
  private readonly storage = new AsyncLocalStorage<MutableRequestContext>();

  run<T>(context: RequestContext, work: () => T): T {
    return this.storage.run({ ...context }, work);
  }

  current(): Readonly<RequestContext> | undefined {
    return this.storage.getStore();
  }

  /** Called only after a trusted AuthN guard has verified the actor. */
  setActor(actor: Readonly<{ id: string; type: PrincipalType }>): void {
    const current = this.storage.getStore();
    if (current) {
      // Mutate only this request's private ALS store: Nest guards and controllers
      // can resume in different async branches after an await. enterWith() would
      // affect only the guard branch and the controller would miss the actor.
      current.actor = Object.freeze({ id: actor.id, type: actor.type });
    }
  }
}

/** One process-local ALS namespace; no database, cache or telemetry SDK. */
export const requestContext = new RequestContextStorage();
