import { Controller, Get, Header, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from './database/database.service';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('Health')
@Controller('health')
export class AppController {
  constructor(private readonly database: DatabaseService) {}

  @Get('ready')
  @ApiOkResponse({ description: 'Core can reach the database and required migration is applied.' })
  @ApiServiceUnavailableResponse({ description: 'Database or required migration is unavailable.' })
  @Header('Cache-Control', 'no-store')
  async ready() {
    if (!await this.database.isReady()) throw new ServiceUnavailableException('Database is not ready.');
    return { status: 'ok', service: 'core', database: 'ready' };
  }

  @Get('live')
  @ApiOkResponse({ description: 'Core process is serving HTTP requests; no DB required.' })
  @Header('Cache-Control', 'no-store')
  live() {
    return {
      status: 'ok',
      service: 'core',
      timestamp: new Date().toISOString(),
    };
  }
}
