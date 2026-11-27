import { conversationRequest } from './conversation-api';
import type { PdfGrant } from './product-api';

export type CopilotStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type CopilotRun = { id: string; status: CopilotStatus };
export type CopilotIntent = { clientMessageId: string; content: string };
export type CopilotCitation = { documentId: string; versionId: string; label: string;
  sourceLocation: { pages?: number[]; clause?: string; anchor?: string } | null;
  policyId: string | null; productId: string | null };
export type CopilotTurn = CopilotRun & {
  question: { id: string; content: string; clientMessageId: string | null; createdAt: string };
  answer: { id: string; content: string; createdAt: string; citations: CopilotCitation[] } | null;
  sourceThroughSequence: string | null;
};
export type CopilotPage = { items: CopilotTurn[]; beforeCursor: string | null; activeRun: CopilotRun | null };
const copilotPath = (id: string) => `staff/conversations/${encodeURIComponent(id)}/copilot`;

export function readCopilot(id: string, signal: AbortSignal, before?: string) {
  const path = copilotPath(id);
  return conversationRequest<CopilotPage>(before ? `${path}?before=${encodeURIComponent(before)}` : path, signal);
}

export function sendCopilot(id: string, intent: CopilotIntent, csrf: string, signal: AbortSignal) {
  return conversationRequest<CopilotRun & { replayed: boolean }>(`${copilotPath(id)}/messages`, signal, csrf, intent);
}

export function viewCopilotCitation(citation: CopilotCitation, csrf: string, signal: AbortSignal) {
  const doc = `documents/${encodeURIComponent(citation.documentId)}/versions/${encodeURIComponent(citation.versionId)}/view`;
  return citation.policyId
    ? conversationRequest<PdfGrant>(`staff/${doc}`, signal, csrf, { policyId: citation.policyId })
    : conversationRequest<PdfGrant>(`products/${encodeURIComponent(citation.productId!)}/${doc}`, signal, csrf, {});
}
