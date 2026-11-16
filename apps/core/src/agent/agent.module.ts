import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { InternalAgentController } from './controllers/internal-agent.controller';
import { AgentAccessService } from './services/agent-access.service';
import { AgentDispatcherService } from './services/agent-dispatcher.service';
import { AgentRunService } from './services/agent-run.service';
import { AgentTransportService } from './services/agent-transport.service';

@Module({
  imports: [DatabaseModule],
  controllers: [InternalAgentController],
  providers: [
    AgentTransportService,
    AgentAccessService,
    AgentRunService,
    AgentDispatcherService,
  ],
  exports: [
    AgentTransportService,
    AgentAccessService,
    AgentRunService,
  ],
})
export class AgentModule {}
