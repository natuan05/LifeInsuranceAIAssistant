import { coreRequest, me } from './auth-api';

export type Policy = {
  id: string; policyNumber: string; customerId: string;
  product: { id: string; productCode: string; name: string; isActive: boolean; summary?: string | null };
  status: 'ACTIVE' | 'LAPSED' | 'MATURED' | 'PENDING';
  premiumAmount: string | null; sumAssured: string | null; currency: string | null;
  paymentFrequency: string | null; nextDueDate: string | null; effectiveDate: string | null; expiryDate: string | null;
};
export type PolicyList = { items: Policy[]; total: number; page: number; pageSize: number };
export type PolicyDetail = Policy & {
  customer: { id: string; fullName: string; accountCode: string };
  benefitsSnapshotStatus: 'AVAILABLE' | 'INVALID' | 'NOT_PROVIDED';
  benefitsSnapshot: null | { currency: string | null; snapshotAsOf: string | null; insuranceTermYears: number | null;
    premiumTermYears: number | null; annualPremium: string | null;
    benefits: null | { code: string | null; name: string; amount: string | null; unit: string | null; maxDays: number | null }[] };
};
export type PolicyDocuments = { policyId: string; total: number;
  availability: 'AVAILABLE' | 'PARTIAL' | 'EMPTY' | 'UNAVAILABLE'; mainDocumentStatus: 'AVAILABLE' | 'NOT_PROVIDED' | 'UNAVAILABLE';
  items: { documentId: string; title: string; kind: 'POLICY' | 'POLICY_DRAFT' | 'TERMS' | 'PRODUCT_GUIDE' | 'ENDORSEMENT';
    accessScope: 'PUBLIC' | 'PRIVATE_POLICY'; versionId: string; versionNumber: string; versionCreatedAt: string }[];
};
export const customerPolicies = (id: string, page: number, signal: AbortSignal) => coreRequest<PolicyList>(`staff/customers/${encodeURIComponent(id)}/policies?page=${page}&pageSize=10`, { signal });
export const policyDetail = (id: string, signal: AbortSignal) => coreRequest<{ policy: PolicyDetail }>(`staff/policies/${encodeURIComponent(id)}`, { signal });
export const policyDocuments = (id: string, signal: AbortSignal) => coreRequest<PolicyDocuments>(`staff/policies/${encodeURIComponent(id)}/documents`, { signal });
export type PolicyDocument = PolicyDocuments['items'][number];
export async function documentAccess(policyId: string, document: PolicyDocument, intent: 'view' | 'download', signal: AbortSignal) {
  const session = await me();
  return coreRequest<{ url: string; expiresAt: string }>(`staff/documents/${document.documentId}/versions/${document.versionId}/${intent}`, {
    method: 'POST', signal, headers: { 'Content-Type': 'application/json', 'X-Auth-Request': '1', 'X-CSRF-Token': session.csrfToken },
    body: JSON.stringify({ policyId }),
  });
}

export function policyMoney(value: string | null, currency: string | null) {
  if (value === null) return 'Not provided';
  const [whole, fraction] = value.split('.');
  const decimals = fraction && !(currency === 'VND' && /^0+$/.test(fraction)) ? '.' + fraction : '';
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${decimals}${currency ? ' ' + currency : ''}`;
}
export const policyDate = (value: string | null) => value ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value)) : 'Not provided';
