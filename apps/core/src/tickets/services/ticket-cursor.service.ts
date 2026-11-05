import { Injectable } from '@nestjs/common';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { SafeApiException } from '../../http/safe-api.exception';
import type { TicketQuery } from '../dto/ticket-query.dto';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
@Injectable()
export class TicketCursorService {
  // Ephemeral signing key for the current single-Core deployment. No credentials
  // are derived from cookies/DB passwords or written to the host. Restart resets
  // cursors, not authorization; callers start again at the first page on 400.
  private readonly key = randomBytes(32);
  scope(actorId: string, query: TicketQuery) {
    return createHash('sha256').update(JSON.stringify(['staff-tickets-v1', actorId.toLowerCase(),
      query.search?.toLowerCase() ?? '', query.status ?? '', query.customerId ?? '', query.limit])).digest('hex');
  }
  encode(scope: string, at: Date, id: string) {
    const payload = Buffer.from(JSON.stringify({ v: 1, scope, at: at.toISOString(), id,
      exp: Math.floor(Date.now() / 1000) + 900 })).toString('base64url');
    return `${payload}.${createHmac('sha256', this.key).update(payload).digest('base64url')}`;
  }
  decode(encoded: string | undefined, scope: string): { at: Date; id: string } | null {
    if (encoded === undefined) return null;
    try {
      if (encoded.length > 2731 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(encoded)) throw new Error();
      const [payload, signature] = encoded.split('.');
      const received = Buffer.from(signature, 'base64url');
      const expected = createHmac('sha256', this.key).update(payload).digest();
      if (received.toString('base64url') !== signature || received.length !== expected.length || !timingSafeEqual(received, expected)) throw new Error();
      const bytes = Buffer.from(payload, 'base64url');
      if (bytes.length > 2048 || bytes.toString('base64url') !== payload) throw new Error();
      const value: unknown = JSON.parse(bytes.toString('utf8'));
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
      const data = value as Record<string, unknown>;
      if (Object.keys(data).sort().join(',') !== 'at,exp,id,scope,v' || data.v !== 1 || data.scope !== scope
        || typeof data.id !== 'string' || !uuid.test(data.id) || typeof data.at !== 'string'
        || !/^(?!0000)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(data.at)
        || new Date(data.at).toISOString() !== data.at || typeof data.exp !== 'number' || !Number.isSafeInteger(data.exp)
        || data.exp <= Math.floor(Date.now() / 1000)) throw new Error();
      return { at: new Date(data.at), id: data.id.toLowerCase() };
    } catch { throw new SafeApiException('INVALID_CURSOR'); }
  }
}
