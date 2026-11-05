import { coreRequest } from './auth-api';
export const ticketStatuses = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;
export type TicketStatus = typeof ticketStatuses[number];
export type TicketItem = { id: string; ticketCode: string; title: string; status: TicketStatus; createdAt: string; customer: { id: string; fullName: string; accountCode: string } };
export type TicketList = { items: TicketItem[]; pageInfo: { hasMore: boolean; nextCursor: string | null } };
export type Ticket = TicketItem & { version: number; policy: { id: string; policyNumber: string } | null; confirmedAt: string; confirmationSource: 'LEGACY_UNVERIFIED'; confirmedContent: null; aiSummary: string | null; allowedActions: { accept: boolean; transitions: TicketStatus[] }; chatLink: { conversationId: string; capability: 'REQUEST_METADATA' | 'TRANSCRIPT'; href: string } | null };
export function listTickets(filters: string, cursor: string | null, signal: AbortSignal) {
  const query = new URLSearchParams(filters); query.set('limit', '20'); if (cursor) query.set('cursor', cursor);
  return coreRequest<TicketList>(`staff/tickets?${query}`, { signal });
}
export const readTicket = (id: string, signal: AbortSignal) => coreRequest<{ ticket: Ticket }>(`staff/tickets/${encodeURIComponent(id)}`, { signal });
export const acceptTicket = (ticket: Ticket, csrfToken: string, signal: AbortSignal) => coreRequest<{ ticket: Ticket }>(`staff/tickets/${encodeURIComponent(ticket.id)}/accept`, {
  method: 'POST', signal, headers: { 'Content-Type': 'application/json', 'X-Auth-Request': '1', 'X-CSRF-Token': csrfToken }, body: JSON.stringify({ expectedVersion: ticket.version }),
});

export const updateTicketStatus = (ticket: Ticket, status: TicketStatus, csrfToken: string, signal: AbortSignal) => coreRequest<{ ticket: Ticket }>(`staff/tickets/${encodeURIComponent(ticket.id)}/status`, { method: 'PATCH', signal, headers: { 'Content-Type': 'application/json', 'X-Auth-Request': '1', 'X-CSRF-Token': csrfToken }, body: JSON.stringify({ expectedVersion: ticket.version, status }) });
