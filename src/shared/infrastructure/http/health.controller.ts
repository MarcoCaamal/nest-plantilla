import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

/** Technical liveness only: no dependency on a database or other provider. */
@ApiTags('system')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOkResponse({ description: 'Process is alive.' })
  health() {
    return { status: 'ok' } as const;
  }
}
