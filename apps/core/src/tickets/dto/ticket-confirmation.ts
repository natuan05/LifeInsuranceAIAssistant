import type { Prisma } from '../../generated/prisma/client';
import { ticketHash, ticketConfirmation } from './ticket-content';
export type ConfirmedTicketContent = { schemaVersion: number; title: string; description: string; policyId: string | null;
  policyNumber: string | null; confirmedAt: string; contentHash: string; draftId: string | null; draftVersion: number | null; textVersion: string | null };
export function legacyTicketConfirmation() { return { confirmationSource: 'LEGACY_UNVERIFIED' as const, confirmedContent: null }; }
export function projectTicketConfirmation(ticket: { title: string; policyId: string | null; sourceDraftId: string | null;
  requestFingerprint: string | null; confirmedContent: Prisma.JsonValue | null; confirmedAt: Date }) {
  const data = ticket.confirmedContent;
  if (!ticket.requestFingerprint || !data || typeof data !== 'object' || Array.isArray(data)) return legacyTicketConfirmation();
  const s = data as Record<string, unknown>;
  const source = s.source;
  if (s.schemaVersion !== 1 || (source !== 'CUSTOMER_SUBMITTED' && source !== 'CUSTOMER_CONFIRMED') ||
    typeof s.title !== 'string' || typeof s.description !== 'string' || !s.title.trim() || !s.description.trim() ||
    s.title !== ticket.title || s.policyId !== ticket.policyId ||
    !(s.policyNumber === null || typeof s.policyNumber === 'string') || s.confirmedAt !== ticket.confirmedAt.toISOString() ||
    s.contentHash !== ticketHash({ title: s.title, description: s.description, policyId: s.policyId })) return legacyTicketConfirmation();
  if (source === 'CUSTOMER_SUBMITTED' ? (ticket.sourceDraftId !== null || s.draftId !== null || s.draftVersion !== null || s.textVersion !== null)
    : (!ticket.sourceDraftId || s.draftId !== ticket.sourceDraftId || !Number.isInteger(s.draftVersion) || Number(s.draftVersion) < 1 || s.textVersion !== ticketConfirmation.textVersion)) return legacyTicketConfirmation();
  return { confirmationSource: source as 'CUSTOMER_SUBMITTED' | 'CUSTOMER_CONFIRMED', confirmedContent: {
    schemaVersion: 1, title: s.title, description: s.description, policyId: ticket.policyId,
    policyNumber: s.policyNumber as string | null, confirmedAt: s.confirmedAt as string, contentHash: s.contentHash as string,
    draftId: s.draftId as string | null, draftVersion: s.draftVersion as number | null, textVersion: s.textVersion as string | null,
  } satisfies ConfirmedTicketContent };
}
