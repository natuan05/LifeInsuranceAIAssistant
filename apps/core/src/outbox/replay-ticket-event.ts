import 'reflect-metadata';
import { DatabaseService } from '../database/database.service';
import { ConversationCommandService } from '../conversations/services/conversation-command.service';
import { TicketAccessService } from '../tickets/services/ticket-access.service';
import { TicketEventService } from '../tickets/services/ticket-event.service';

async function main() {
  const id = process.argv[2];
  if (process.argv.length !== 3 || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id ?? '')) throw new Error();
  const database = new DatabaseService();
  try {
    await database.onModuleInit();
    const service = new TicketEventService(database, new TicketAccessService(), new ConversationCommandService(database));
    const result = await service.replayCreated(id);
    console.log(result.queued ? 'Ticket creation event queued for replay.' : 'Ticket creation event already published.');
  } finally { await database.onModuleDestroy(); }
}
void main().catch(() => { console.error('Replay refused or unavailable. Check event type, lease, creation audit and confirmed snapshot.'); process.exitCode = 1; });
