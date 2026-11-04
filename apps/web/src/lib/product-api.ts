import { coreRequest } from './auth-api';

export type Product = { id: string; productCode: string; name: string; summary: string | null; isActive: boolean };
export type ProductList = { items: Product[]; total: number; page: number; pageSize: number };
export type ProductDocument = { documentId: string; title: string; accessScope: 'PUBLIC'; versionId: string; versionNumber: string; versionCreatedAt: string };
export type ProductDocuments = { items: ProductDocument[]; pageInfo: { hasMore: boolean; nextCursor: string | null } };
export type PdfGrant = { url: string; expiresAt: string };
export function listProducts(search: string, page: number, signal: AbortSignal) {
  const query = new URLSearchParams({ page: String(page), pageSize: '10' });
  if (search) query.set('search', search);
  return coreRequest<ProductList>(`products?${query}`, { signal });
}
export const readProduct = (id: string, signal: AbortSignal) => coreRequest<{ product: Product }>(`products/${encodeURIComponent(id)}`, { signal });
export function readProductDocuments(id: string, cursor: string | null, signal: AbortSignal) {
  const query = new URLSearchParams({ limit: '20' });
  if (cursor) query.set('cursor', cursor);
  return coreRequest<ProductDocuments>(`products/${encodeURIComponent(id)}/documents?${query}`, { signal });
}
export const productDocumentAccess = (id: string, document: ProductDocument, intent: 'view' | 'download', csrfToken: string, signal: AbortSignal) =>
  coreRequest<PdfGrant>(`products/${encodeURIComponent(id)}/documents/${encodeURIComponent(document.documentId)}/versions/${encodeURIComponent(document.versionId)}/${intent}`, {
    method: 'POST', signal, headers: { 'Content-Type': 'application/json', 'X-Auth-Request': '1', 'X-CSRF-Token': csrfToken }, body: '{}',
  });
