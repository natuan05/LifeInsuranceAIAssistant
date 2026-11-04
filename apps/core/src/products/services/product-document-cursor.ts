import { createHash } from 'node:crypto';
import { SafeApiException } from '../../http/safe-api.exception';
import type { ProductActor } from './product.service';

export function productDocumentScope(actor: ProductActor, productId: string, limit: number) {
  return createHash('sha256').update(JSON.stringify(['product-documents', actor.id.toLowerCase(), actor.role, productId.toLowerCase(), limit])).digest('hex');
}
export function encodeProductDocumentCursor(scope: string, title: string, id: string) {
  return Buffer.from(JSON.stringify({ v: 1, scope, title, id })).toString('base64url');
}
export function decodeProductDocumentCursor(encoded: string | undefined, scope: string): { title: string; id: string } | null {
  if (encoded === undefined) return null;
  try {
    if (encoded.length > 2731 || !/^[A-Za-z0-9_-]+$/.test(encoded)) throw new Error();
    const bytes = Buffer.from(encoded, 'base64url');
    if (bytes.length > 2048 || bytes.toString('base64url') !== encoded) throw new Error();
    const data: unknown = JSON.parse(bytes.toString('utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
    const value = data as Record<string, unknown>;
    if (Object.keys(value).sort().join(',') !== 'id,scope,title,v' || value.v !== 1 || value.scope !== scope
      || typeof value.title !== 'string' || Array.from(value.title).length > 255 || value.title.includes('\0')
      || typeof value.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.id)) throw new Error();
    return { title: value.title, id: value.id.toLowerCase() };
  } catch { throw new SafeApiException('INVALID_CURSOR'); }
}
