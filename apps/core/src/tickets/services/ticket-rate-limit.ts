import { tokenHash } from '../../auth/services/auth.service';
import type { PrismaClient } from '../../generated/prisma/client';
import { SafeApiException } from '../../http/safe-api.exception';

export async function consumeTicketReadQuota(client: PrismaClient, actorId: string, command = false) {
  return consume(client, actorId, command ? 'TICKET_ACCEPT' : 'TICKET_READ', command ? 30 : 120);
}
export function consumeCustomerTicketQuota(client: PrismaClient, actorId: string, command = false) {
  return consume(client, actorId, command ? 'CUSTOMER_TICKET_WRITE' : 'CUSTOMER_TICKET_READ', command ? 10 : 120);
}
async function consume(client: PrismaClient, actorId: string, group: string, maximum: number) {
  const token = tokenHash(actorId.toLowerCase());
  const [bucket] = await client.$queryRaw<Array<{ request_count: number; remaining: number }>>`
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
