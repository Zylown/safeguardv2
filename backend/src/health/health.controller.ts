import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { getHealthResponse } from './health.response';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Check API process health without querying dependencies' })
  @ApiOkResponse({ schema: { example: { status: 'ok' } } })
  getHealth(): { status: 'ok' } {
    return getHealthResponse();
  }
}
