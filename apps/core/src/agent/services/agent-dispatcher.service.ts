import { Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { AgentRunService } from './agent-run.service';

@Injectable()
export class AgentDispatcherService implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running: Promise<void> | null = null;
  private stopped = false;

  constructor(private readonly runs: AgentRunService) {}

  onApplicationBootstrap() {
    this.timer = setInterval(() => {
      if (!this.running && !this.stopped) {
        this.running = this.runs.reconcileTick().catch(() => {
          // DB or Agent temporarily unavailable; retry on next bounded tick.
        }).finally(() => {
          this.running = null;
        });
      }
    }, 1000);
    this.timer.unref();
  }

  async onModuleDestroy() {
    this.stopped = true;
    clearInterval(this.timer);
    if (this.running) {
      await Promise.race([
        this.running,
        new Promise(resolve => {
          const timer = setTimeout(resolve, 5000);
          timer.unref();
        }),
      ]);
    }
  }
}
