import { createHash } from 'node:crypto';
import {
  CallHandler, ExecutionContext, HttpException, Injectable, NestInterceptor,
} from '@nestjs/common';
import { Prisma, type IdempotencyRecord } from '@prisma/client';
import { from, lastValueFrom, type Observable } from 'rxjs';
import { IdGeneratorPort } from '@/shared/application/ports/id-generator.port';
import { PrismaService } from '@/shared/infrastructure/persistence/prisma.service';

type Request = {
  readonly headers: Record<string, string | string[] | undefined>;
  readonly method: string;
  readonly path: string;
  readonly body: unknown;
  readonly ip?: string;
  readonly principal?: { readonly id: string };
};

function conflict(code: string): HttpException {
  return new HttpException({
    type: 'about:blank', title: 'Conflict', status: 409, code,
  }, 409);
}

/** Opt-in per route. Uses durable unique records; never caches raw headers. */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService, private readonly ids: IdGeneratorPort) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return from(this.execute(context, next));
  }

  private async execute(context: ExecutionContext, next: CallHandler): Promise<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const key = request.headers['idempotency-key'];
    if (key === undefined) return lastValueFrom(next.handle());
    if (typeof key !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(key)) {
      throw new HttpException({
        type: 'about:blank', title: 'Bad Request', status: 400, code: 'INVALID_IDEMPOTENCY_KEY',
      }, 400);
    }
    const actorId = request.principal?.id ?? 'anonymous:' + createHash('sha256')
      .update(request.ip ?? 'unknown').digest('hex');
    const requestHash = createHash('sha256')
      .update(JSON.stringify(request.body ?? null)).digest('hex');
    const where = { actorId_method_path_key: {
      actorId, method: request.method, path: request.path, key,
    } };
    const existing = await this.prisma.idempotencyRecord.findUnique({ where });
    if (existing) return this.replay(existing, requestHash);
    const id = this.ids.generate();
    try {
      await this.prisma.idempotencyRecord.create({
        data: {
          id, key, actorId, method: request.method, path: request.path, requestHash,
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const winner = await this.prisma.idempotencyRecord.findUnique({ where });
        if (winner) return this.replay(winner, requestHash);
      }
      throw error;
    }

    try {
      const output = await lastValueFrom(next.handle());
      const envelope = output as { _tag?: string; status?: number; problem?: { status: number } };
      const status = envelope._tag === 'HttpProblem'
        ? envelope.problem?.status ?? 500 : envelope.status ?? 200;
      await this.prisma.idempotencyRecord.update({
        where: { id },
        data: { statusCode: status, responseBody: JSON.parse(JSON.stringify(output)) as Prisma.InputJsonValue },
      });
      return output;
    } catch (error) {
      await this.prisma.idempotencyRecord.deleteMany({ where: { id } });
      throw error;
    }
  }

  private replay(existing: IdempotencyRecord, requestHash: string): unknown {
    if (existing.requestHash !== requestHash) throw conflict('IDEMPOTENCY_KEY_CONFLICT');
    if (existing.statusCode === null || existing.responseBody === null) throw conflict('IDEMPOTENCY_IN_PROGRESS');
    return existing.responseBody;
  }
}
