import { createHash } from 'node:crypto';
import { SafeApiException } from '../../http/safe-api.exception';
import type { ConversationRole } from './conversation-session.service';
function scope(actor: string, id: string, role: ConversationRole, direction: 'before' | 'after') {
  return createHash('sha256').update(JSON.stringify([actor.toLowerCase(), id.toLowerCase(), role, direction])).digest('hex');
}
export function encodeMessageCursor(actor: string, id: string, role: ConversationRole, direction: 'before' | 'after', sequence: bigint) {
  return Buffer.from(JSON.stringify({ v: 1, scope: scope(actor, id, role, direction), seq: sequence.toString() })).toString('base64url');
}
export function decodeMessageCursor(encoded: string, actor: string, id: string, role: ConversationRole, direction: 'before' | 'after') {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(encoded) || encoded.length > 2731) throw new Error();
    const bytes = Buffer.from(encoded, 'base64url');
    if (bytes.length > 2048 || bytes.toString('base64url') !== encoded) throw new Error();
    const value: unknown = JSON.parse(bytes.toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    const data = value as Record<string, unknown>;
    if (Object.keys(data).sort().join(',') !== 'scope,seq,v' || data.v !== 1 || data.scope !== scope(actor, id, role, direction) ||
      typeof data.seq !== 'string' || !/^(0|[1-9][0-9]{0,18})$/.test(data.seq)) throw new Error();
    const sequence = BigInt(data.seq); if (sequence > 9223372036854775807n) throw new Error();
    return sequence;
  } catch { throw new SafeApiException('INVALID_CURSOR'); }
}
