import { Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service';
import { ConversationEventService, type ChatEvent } from '../../conversations/services/conversation-event.service';
import { RealtimeService } from '../../realtime/realtime.service';

const types = ['CONVERSATION_CREATED', 'HANDOFF_REQUESTED', 'HANDOFF_ACCEPTED', 'MESSAGE_COMMITTED', 'CONVERSATION_ACCESS_REVOKED'];
@Injectable()
export class OutboxDispatcherService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly owner = randomUUID();
  private timer?: NodeJS.Timeout;
  private running: Promise<void> | null = null;
  private stopped = false;
  constructor(private readonly database: DatabaseService, private readonly events: ConversationEventService, private readonly realtime: RealtimeService) {}
  onApplicationBootstrap() {
    this.timer = setInterval(() => { if (!this.running && !this.stopped) { this.running = this.tick().catch(() => { /* DB unavailable: retry on next bounded tick; no payload logs. */ }).finally(() => { this.running = null; }); } }, 500);
    this.timer.unref();
  }
  async claim(): Promise<Array<ChatEvent & { retryCount: number }>> {
    return this.database.prisma.$queryRaw`
      WITH due AS (
        SELECT id FROM business.outbox_events WHERE aggregate_type='CONVERSATION'
          AND event_type IN ('CONVERSATION_CREATED','HANDOFF_REQUESTED','HANDOFF_ACCEPTED','MESSAGE_COMMITTED','CONVERSATION_ACCESS_REVOKED')
          AND ((status='PENDING' AND next_attempt_at<=NOW()) OR (status='PROCESSING' AND (lease_expires_at IS NULL OR lease_expires_at<=NOW())))
        ORDER BY next_attempt_at,id FOR UPDATE SKIP LOCKED LIMIT 20
      ) UPDATE business.outbox_events e SET status='PROCESSING',lease_owner=${this.owner},
        lease_expires_at=NOW()+INTERVAL '30 seconds',retry_count=e.retry_count+1
        FROM due WHERE e.id=due.id RETURNING e.id,e.aggregate_id AS "aggregateId",e.event_type AS "eventType",e.retry_count AS "retryCount"`;
  }
  async tick() {
    for (const event of await this.claim()) await this.process(event);
  }
  async process(event: ChatEvent & { retryCount: number }) {
      if (!types.includes(event.eventType)) return;
      // Renew before each bounded handler in the batch. Never hold a row lock across WS work.
      const lease = await this.database.prisma.outboxEvent.updateMany({ where: { id: event.id, status: 'PROCESSING', leaseOwner: this.owner }, data: { leaseExpiresAt: new Date(Date.now() + 30000) } });
      if (!lease.count) return;
      let renewing = false, lost = false;
      const renew = setInterval(() => {
        if (renewing) return;
        renewing = true;
        void this.database.prisma.outboxEvent.updateMany({ where: { id: event.id, status: 'PROCESSING', leaseOwner: this.owner },
          data: { leaseExpiresAt: new Date(Date.now() + 30000) } }).then(result => { if (!result.count) lost = true; }).catch(() => { lost = true; }).finally(() => { renewing = false; });
      }, 10000);
      renew.unref();
      try {
        const recipients = await this.events.route(event);
        if (lost) return;
        await this.realtime.publishChat(event, recipients);
        await this.database.prisma.outboxEvent.updateMany({ where: { id: event.id, leaseOwner: this.owner, status: 'PROCESSING' },
          data: { status: 'PUBLISHED', leaseOwner: null, leaseExpiresAt: null, lastError: null } });
      } catch {
        const exhausted = event.retryCount >= 8;
        const delay = Math.min(60, 2 ** Math.min(6, event.retryCount - 1)) * 1000 + Math.floor(Math.random() * 250);
        await this.database.prisma.outboxEvent.updateMany({ where: { id: event.id, leaseOwner: this.owner, status: 'PROCESSING' },
          data: { status: exhausted ? 'FAILED_DLQ' : 'PENDING', nextAttemptAt: new Date(Date.now() + delay), lastError: 'DISPATCH_FAILED', leaseOwner: null, leaseExpiresAt: null } });
      } finally { clearInterval(renew); }
  }
  async onModuleDestroy() {
    this.stopped = true; clearInterval(this.timer);
    if (this.running) await Promise.race([this.running, new Promise(resolve => { const timer = setTimeout(resolve, 5000); timer.unref(); })]);
  }
}
