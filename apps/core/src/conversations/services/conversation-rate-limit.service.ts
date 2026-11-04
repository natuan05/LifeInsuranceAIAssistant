import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DatabaseService } from '../../database/database.service';
import { SafeApiException } from '../../http/safe-api.exception';

@Injectable()
export class ConversationRateLimitService {
  constructor(private readonly database: DatabaseService) {}
  async read(actorId: string) {
    return this.consume(actorId, 'INBOX_READ', 240);
  }
  async command(actorId: string, operation: 'CREATE' | 'HANDOFF' | 'ACCEPT' | 'LOOKUP' | 'SEND' | 'NOTIFICATION_READ') {
    const limits = { CREATE: 10, HANDOFF: 5, ACCEPT: 30, LOOKUP: 120, SEND: 60, NOTIFICATION_READ: 120 };
    return this.consume(actorId, `CONVERSATION_${operation}`, limits[operation]);
  }
  private async consume(actorId: string, group: string, maximum: number) {
    const token = createHash('sha256').update(actorId.toLowerCase()).digest('hex');
    // Separate autocommit from the RepeatableRead resource snapshot: concurrent
    // reads must not cause serialization failures on the shared quota row.
    const [bucket] = await this.database.prisma.$queryRaw<Array<{ request_count: number; remaining: number }>>`
      INSERT INTO business.rate_limit_buckets(client_token,endpoint_group,window_start,request_count)
      VALUES (${token},${group},NOW(),1)
      ON CONFLICT(client_token,endpoint_group) DO UPDATE SET
        request_count=CASE WHEN rate_limit_buckets.window_start<=NOW()-INTERVAL '60 seconds'
          THEN 1 ELSE LEAST(rate_limit_buckets.request_count+1,${maximum + 1}) END,
        window_start=CASE WHEN rate_limit_buckets.window_start<=NOW()-INTERVAL '60 seconds'
          THEN NOW() ELSE rate_limit_buckets.window_start END
      RETURNING request_count,GREATEST(1,CEIL(EXTRACT(EPOCH FROM(window_start+INTERVAL '60 seconds'-NOW()))))::int AS remaining`;
    if (bucket.request_count > maximum) throw new SafeApiException('RATE_LIMITED', bucket.remaining);
  }
}
