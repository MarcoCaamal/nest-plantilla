import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { Result } from '@/shared/core/result';
import { HttpResult } from '../http/http-result';
import { ReadinessService } from './readiness.service';

/**
 * Installed only if ReadinessModule.register() is explicitly imported.
 * Internal checks are not exposed on public HTTP responses.
 */
@ApiTags('system')
@Controller('health')
export class ReadinessController {
  constructor(private readonly readiness: ReadinessService) {}

  @Get('ready')
  @ApiOkResponse({ description: 'All configured critical dependencies are ready.' })
  @ApiServiceUnavailableResponse({ description: 'At least one critical dependency is not ready.' })
  async ready() {
    const report = await this.readiness.evaluate();
    const result = report.status === 'ready'
      ? Result.ok({ status: 'ready' } as const)
      : Result.err({ code: 'NOT_READY' } as const);

    return HttpResult.from(
      result,
      () => ({
        type: 'about:blank',
        title: 'Service Unavailable',
        status: 503,
        code: 'NOT_READY',
        detail: 'One or more critical dependencies are not ready',
      }),
    );
  }
}
