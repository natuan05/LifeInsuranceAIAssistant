import { coreApiUrl } from './core-api';

export type InboxFilter = 'all' | 'requests' | 'active';
export function inboxFilter(value: string | null): InboxFilter {
  return value === 'requests' || value === 'request' ? 'requests' : value === 'active' || value === 'recent' ? 'active' : 'all';
}
export type InboxCustomer = { id: string; fullName: string; accountCode: string };
export type ConversationRow = { id: string; subject: string; status: 'PENDING_HANDOFF' | 'STAFF_ACTIVE'; entryType: 'REQUEST' | 'DIRECT' | 'TRANSFERRED'; activityAt: string };
export type Conversation = ConversationRow & { customer: InboxCustomer; controlVersion: number; request?: { id: string; sharedReason: string | null; requestedAt: string }; allowedActions: { readMessages: boolean; accept: boolean; send: boolean } };
export type CursorPage<T> = { items: T[]; pageInfo: { hasMore: boolean; nextCursor: string | null } };
export type ChatMessage = { id: string; sequence: string; senderType: 'CUSTOMER' | 'STAFF' | 'AI_AGENT' | 'SYSTEM'; sender: { displayName: string }; content: string; createdAt: string; citations: { documentId: string; versionId: string; page: number | null; label: string }[] };
export type MessagePage = { items: ChatMessage[]; pageInfo: { beforeCursor: string | null; afterCursor: string; hasMoreBefore: boolean; hasMoreAfter: boolean } };
export class ConversationError extends Error {
  constructor(public status: number, public code: string, public requestId?: string) {
    super(status === 401 ? 'Your session has expired. Sign in again.' : status === 403 || status === 404 ? 'This conversation is no longer available to you.' : status === 409 ? 'This conversation has changed. Review its current state before continuing.' : status === 429 ? 'Too many requests. Wait a moment and retry.' : 'Unable to load the conversation. Please retry.');
  }
}
async function request<T>(path: string, signal?: AbortSignal, csrfToken?: string, body?: unknown): Promise<T> {
  const base = coreApiUrl.startsWith('/') ? coreApiUrl : (() => {
    const url = new URL(coreApiUrl);
    if (['localhost', '127.0.0.1'].includes(window.location.hostname) && ['localhost', '127.0.0.1'].includes(url.hostname)) url.hostname = window.location.hostname;
    return url.toString().replace(/\/$/, '');
  })();
  const response = await fetch(`${base}/${path}`, {
    credentials: 'include', cache: 'no-store', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
    ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Auth-Request': '1', 'X-CSRF-Token': csrfToken ?? '' }, body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new ConversationError(response.status, typeof error.code === 'string' ? error.code : 'UNKNOWN', error.requestId);
  }
  return response.json();
}
function query(values: Record<string, string | undefined>) {
  return new URLSearchParams(Object.entries(values).filter((entry): entry is [string, string] => entry[1] !== undefined)).toString();
}
export const inboxCustomers = (filter: InboxFilter, search: string, customerId: string | undefined, cursor: string | undefined, signal: AbortSignal) => request<CursorPage<{ customer: InboxCustomer; lastActivityAt: string }>>(`staff/inbox/customers?${query({ filter, search, customerId, cursor })}`, signal);
export const inboxConversations = (id: string, filter: InboxFilter, cursor: string | undefined, signal: AbortSignal) => request<CursorPage<ConversationRow>>(`staff/inbox/customers/${encodeURIComponent(id)}/conversations?${query({ filter, cursor })}`, signal);
export const conversationDetail = (id: string, signal?: AbortSignal) => request<{ conversation: Conversation }>(`staff/conversations/${encodeURIComponent(id)}`, signal);
export const conversationMessages = (id: string, direction: { before?: string; after?: string }, signal: AbortSignal, role: 'STAFF' | 'CUSTOMER' = 'STAFF') => request<MessagePage>(`${role === 'STAFF' ? 'staff' : 'customers/me'}/conversations/${encodeURIComponent(id)}/messages?${query({ limit: '50', ...direction })}`, signal);
export type AcceptIntent = { clientRequestId: string; expectedVersion: number };
export const acceptConversation = (id: string, intent: AcceptIntent, csrfToken: string, signal: AbortSignal) => request<{ conversation: Conversation; replayed: boolean }>(`staff/conversations/${encodeURIComponent(id)}/accept`, signal, csrfToken, intent);
export const reconcileAccept = (id: string, intent: AcceptIntent, signal: AbortSignal) => request<{ state: 'COMMITTED'; resourceId: string; conversationId: string; controlVersion: number }>(`staff/conversations/${encodeURIComponent(id)}/commands/${encodeURIComponent(intent.clientRequestId)}?operation=ACCEPT_HANDOFF`, signal);

export function mergeMessages(existing: ChatMessage[], incoming: ChatMessage[]) {
  const byId = new Map(existing.map(message => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => BigInt(a.sequence) < BigInt(b.sequence) ? -1 : BigInt(a.sequence) > BigInt(b.sequence) ? 1 : a.id.localeCompare(b.id));
}

export type SendIntent = { clientMessageId: string; expectedVersion: number; content: string };
export type MessageAck = { message: ChatMessage & { clientMessageId: string }; controlVersion: number; replayed?: boolean };
const conversationPath = (role: 'STAFF' | 'CUSTOMER', id: string) => `${role === 'STAFF' ? 'staff' : 'customers/me'}/conversations/${encodeURIComponent(id)}`;
export const sendMessage = (role: 'STAFF' | 'CUSTOMER', id: string, intent: SendIntent, csrf: string, signal: AbortSignal) => request<MessageAck>(`${conversationPath(role, id)}/messages`, signal, csrf, intent);
export const lookupMessage = (role: 'STAFF' | 'CUSTOMER', id: string, key: string, signal: AbortSignal) => request<MessageAck>(`${conversationPath(role, id)}/messages/by-client-id/${encodeURIComponent(key)}`, signal);
export type CustomerConversation = { id: string; subject: string; status: 'AI_ACTIVE' | 'PENDING_HANDOFF' | 'STAFF_ACTIVE'; controlVersion: number; entryType: string; activityAt?: string; staff: { fullName: string } | null; allowedActions: { readMessages: boolean; send: boolean; requestStaff: boolean } };
export type ChatSupport = { availability: string; assignmentVersion: number; staff: { fullName: string } | null; handoffConsent: { textVersion: string; scope: string; text: string } };
export const customerConversations = (cursor: string | undefined, signal: AbortSignal) => request<CursorPage<CustomerConversation>>(`customers/me/conversations?${query({ cursor })}`, signal);
export const customerConversation = (id: string, signal: AbortSignal) => request<{ conversation: CustomerConversation }>(conversationPath('CUSTOMER', id), signal);
export const chatSupport = (signal: AbortSignal) => request<ChatSupport>('customers/me/chat-support', signal);
export type CreateIntent = { clientRequestId: string; kind: 'AI' | 'DIRECT'; subject: string; expectedAssignmentVersion?: number };
export const createConversation = (intent: CreateIntent, csrf: string, signal: AbortSignal) => request<{ conversation: CustomerConversation }>('customers/me/conversations', signal, csrf, intent);
export type HandoffIntent = { clientRequestId: string; expectedVersion: number; expectedAssignmentVersion: number; sharedSubject: string; sharedReason: string; consent: { confirmed: true; textVersion: string; scope: string } };
export const requestHandoff = (id: string, intent: HandoffIntent, csrf: string, signal: AbortSignal) => request<{ conversation: { id: string } }>(`${conversationPath('CUSTOMER', id)}/handoff-requests`, signal, csrf, intent);

export type StaffNotification = { id: string; kind: 'HANDOFF_REQUESTED'; title: string; isRead: boolean; createdAt: string; target: { type: 'CONVERSATION'; id: string } };
export const staffNotifications = (cursor: string | undefined, signal: AbortSignal) => request<CursorPage<StaffNotification>>(`staff/notifications?${query({ cursor })}`, signal);
export const readStaffNotification = (id: string, csrf: string, signal: AbortSignal) => request<{ id: string; isRead: boolean }>(`staff/notifications/${encodeURIComponent(id)}/read`, signal, csrf, {});
