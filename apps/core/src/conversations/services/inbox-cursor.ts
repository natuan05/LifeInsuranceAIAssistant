import { createHash } from 'node:crypto';
import { SafeApiException } from '../../http/safe-api.exception';

type Boundary = { at: string; id: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function inboxCursorScope(actorId: string, kind: 'groups' | 'conversations' | 'customer-conversations' | 'notifications', filter: string, search = '', customerId = '') {
  return createHash('sha256').update(JSON.stringify([actorId.toLowerCase(), kind, filter, search.trim().toLowerCase(), customerId.toLowerCase()])).digest('hex');
}
export function decodeInboxCursor(encoded: string | undefined, scope: string): Boundary | null {
  if (encoded === undefined) return null;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(encoded) || encoded.length > 2731) throw new Error();
    const bytes = Buffer.from(encoded, 'base64url');
    if (bytes.length > 2048 || bytes.toString('base64url') !== encoded) throw new Error();
    const value: unknown = JSON.parse(bytes.toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    const data = value as Record<string, unknown>;
    if (Object.keys(data).sort().join(',') !== 'at,id,scope,v' || data.v !== 1 || data.scope !== scope ||
      typeof data.id !== 'string' || !uuid.test(data.id) || typeof data.at !== 'string' ||
      !/^(?!0000)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(data.at) ||
      new Date(data.at).toISOString() !== data.at) throw new Error();
    return { at: data.at, id: data.id.toLowerCase() };
  } catch { throw new SafeApiException('INVALID_CURSOR'); }
}
export function encodeInboxCursor(scope: string, at: Date, id: string) {
  return Buffer.from(JSON.stringify({ v: 1, scope, at: at.toISOString(), id })).toString('base64url');
}
