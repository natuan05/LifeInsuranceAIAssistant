import { AuthError, coreRequest } from './auth-api';
export const ticketStatuses = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;
export type ConfirmedContent = { title: string; description: string; policyId: string | null; policyNumber: string | null; contentHash: string; confirmedAt: string; draftVersion: number | null; textVersion: string | null };
export type TicketStatus = typeof ticketStatuses[number];
export type TicketItem = { id: string; ticketCode: string; title: string; status: TicketStatus; createdAt: string; customer: { id: string; fullName: string; accountCode: string } };
export type TicketList = { items: TicketItem[]; pageInfo: { hasMore: boolean; nextCursor: string | null } };
export type Ticket = TicketItem & { version: number; policy: { id: string; policyNumber: string } | null; confirmedAt: string; confirmationSource: 'CUSTOMER_SUBMITTED' | 'CUSTOMER_CONFIRMED' | 'LEGACY_UNVERIFIED'; confirmedContent: ConfirmedContent | null; aiSummary: string | null; allowedActions: { accept: boolean; transitions: TicketStatus[] }; chatLink: { conversationId: string; capability: 'REQUEST_METADATA' | 'TRANSCRIPT'; href: string } | null };
export function listTickets(filters: string, cursor: string | null, signal: AbortSignal) {
  const query = new URLSearchParams(filters); query.set('limit', '20'); if (cursor) query.set('cursor', cursor);
  return coreRequest<TicketList>(`staff/tickets?${query}`, { signal });
}
export const readTicket = (id: string, signal: AbortSignal) => coreRequest<{ ticket: Ticket }>(`staff/tickets/${encodeURIComponent(id)}`, { signal });
export const acceptTicket = (ticket: Ticket, csrfToken: string, signal: AbortSignal) => coreRequest<{ ticket: Ticket }>(`staff/tickets/${encodeURIComponent(ticket.id)}/accept`, {
  method: 'POST', signal, headers: { 'Content-Type': 'application/json', 'X-Auth-Request': '1', 'X-CSRF-Token': csrfToken }, body: JSON.stringify({ expectedVersion: ticket.version }),
});

export const updateTicketStatus = (ticket: Ticket, status: TicketStatus, csrfToken: string, signal: AbortSignal) => coreRequest<{ ticket: Ticket }>(`staff/tickets/${encodeURIComponent(ticket.id)}/status`, { method: 'PATCH', signal, headers: { 'Content-Type': 'application/json', 'X-Auth-Request': '1', 'X-CSRF-Token': csrfToken }, body: JSON.stringify({ expectedVersion: ticket.version, status }) });

// --- Customer Ticket Types and APIs ---

export type CustomerTicketSummary = {
  id: string;
  ticketCode: string;
  title: string;
  status: TicketStatus;
  policyNumber: string | null;
  createdAt: string;
  confirmedAt: string | null;
};

export type CustomerTicketList = {
  items: CustomerTicketSummary[];
  total: number;
  page: number;
  pageSize: number;
};

export type CustomerTicketDetail = {
  id: string;
  ticketCode: string;
  title: string;
  status: TicketStatus;
  version: number;
  policyId?: string | null;
  policyNumber?: string | null;
  conversationId?: string | null;
  confirmedContent?: ConfirmedContent | null;
  confirmationSource?: 'CUSTOMER_SUBMITTED' | 'CUSTOMER_CONFIRMED' | 'LEGACY_UNVERIFIED';
  assignedStaff?: {
    id: string;
    fullName: string;
    department?: string | null;
  } | null;
  createdAt: string;
  confirmedAt?: string | null;
};

export type TicketDraft = {
  id: string;
  conversationId: string | null;
  version: number;
  state: 'DRAFT' | 'CONFIRMED' | 'EXPIRED' | 'SUPERSEDED';
  title: string;
  description: string;
  policyId: string | null;
  policyNumber?: string | null;
  expiresAt: string;
  createdAt: string;
};

export type DraftWithConfirmation = {
  draft: TicketDraft;
  confirmation: {
    textVersion: string;
    text: string;
  };
};

export function customerListTickets(
  filters: { status?: string; search?: string; page?: number; pageSize?: number },
  signal: AbortSignal,
) {
  const query = new URLSearchParams();
  if (filters.status && filters.status !== 'ALL') query.set('status', filters.status);
  if (filters.search) query.set('search', filters.search);
  if (filters.page) query.set('page', String(filters.page));
  if (filters.pageSize) query.set('pageSize', String(filters.pageSize));
  return coreRequest<CustomerTicketList>(`customers/me/tickets?${query}`, { signal });
}

export function customerReadTicket(ticketId: string, signal: AbortSignal) {
  return coreRequest<{ ticket: CustomerTicketDetail }>(
    `customers/me/tickets/${encodeURIComponent(ticketId)}`,
    { signal },
  );
}

export function customerCreateManualTicket(
  payload: { clientRequestId: string; title: string; description: string; policyId?: string | null },
  csrfToken: string,
  signal: AbortSignal,
) {
  return coreRequest<{
    ticket: { id: string; ticketCode: string; status: TicketStatus; createdAt: string };
    replayed: boolean;
  }>('customers/me/tickets/manual', {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'X-Auth-Request': '1',
      'X-CSRF-Token': csrfToken,
    },
    body: JSON.stringify({
      clientRequestId: payload.clientRequestId,
      title: payload.title,
      description: payload.description,
      policyId: payload.policyId || undefined,
    }),
  });
}

export function customerGetDraft(conversationId: string, draftId: string, signal: AbortSignal) {
  return coreRequest<DraftWithConfirmation>(
    `customers/me/conversations/${encodeURIComponent(conversationId)}/ticket-drafts/${encodeURIComponent(draftId)}`,
    { signal },
  );
}

export function customerUpdateDraft(
  conversationId: string,
  draftId: string,
  payload: { expectedVersion: number; title: string; description: string; policyId?: string | null },
  csrfToken: string,
  signal: AbortSignal,
) {
  return coreRequest<DraftWithConfirmation>(
    `customers/me/conversations/${encodeURIComponent(conversationId)}/ticket-drafts/${encodeURIComponent(draftId)}`,
    {
      method: 'PUT',
      signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Auth-Request': '1',
        'X-CSRF-Token': csrfToken,
      },
      body: JSON.stringify(payload),
    },
  );
}

export function customerConfirmTicket(
  clientRequestId: string,
  draftId: string,
  expectedDraftVersion: number,
  textVersion: string,
  csrfToken: string,
  signal: AbortSignal,
) {
  return coreRequest<{
    ticket: { id: string; ticketCode: string; status: TicketStatus; confirmedAt: string };
    replayed: boolean;
  }>('customers/me/tickets', {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'X-Auth-Request': '1',
      'X-CSRF-Token': csrfToken,
    },
    body: JSON.stringify({
      clientRequestId,
      draftId,
      expectedDraftVersion,
      confirmation: {
        confirmed: true,
        textVersion,
      },
    }),
  });
}


export type CustomerTicketReceipt = { ticket: { id: string; ticketCode: string; status: string; createdAt: string; confirmedAt: string }; replayed: boolean };
export const customerTicketReceipt = (key: string, signal: AbortSignal) => coreRequest<CustomerTicketReceipt>(`customers/me/tickets/by-client-request-id/${encodeURIComponent(key)}`, { signal });
export type CustomerTicketIntent = { key: string } & ({ operation: 'MANUAL'; title: string; description: string; policyId: string | null } |
  { operation: 'CONFIRM'; draftId: string; version: number; textVersion: string });
export class TicketOutcomeUnknown extends Error {
  constructor() { super('The result is not confirmed yet. Check and retry this request before starting another.'); }
}
export async function submitCustomerTicketIntent(intent: CustomerTicketIntent, csrfToken: string, signal: AbortSignal, checkFirst: boolean) {
  const receipt = async () => {
    try { return await customerTicketReceipt(intent.key, AbortSignal.any([signal, AbortSignal.timeout(15000)])); }
    catch (error) { if (error instanceof AuthError && error.status === 404) return null; throw error; }
  };
  if (checkFirst) {
    const existing = await receipt(); signal.throwIfAborted();
    if (existing) return existing;
  }
  try {
    const attempt = AbortSignal.any([signal, AbortSignal.timeout(15000)]);
    return intent.operation === 'MANUAL'
      ? await customerCreateManualTicket({ clientRequestId: intent.key, title: intent.title, description: intent.description, policyId: intent.policyId }, csrfToken, attempt)
      : await customerConfirmTicket(intent.key, intent.draftId, intent.version, intent.textVersion, csrfToken, attempt);
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof AuthError && error.status < 500) throw error;
    try { const result = await receipt(); signal.throwIfAborted(); if (result) return result; }
    catch (receiptError) { signal.throwIfAborted(); if (receiptError instanceof AuthError && [401, 403].includes(receiptError.status)) throw receiptError; }
    throw new TicketOutcomeUnknown();
  }
}
