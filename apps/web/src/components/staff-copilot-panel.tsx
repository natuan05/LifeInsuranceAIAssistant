'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { chatScopeEvent, connectionEvent } from '@/lib/chat-realtime';
import { ConversationError } from '@/lib/conversation-api';
import { copilotEvent, realtimeEvent } from '@/lib/realtime';
import { AiReplyIndicator } from './ai-reply-indicator';
import { AiReplyText } from './ai-reply-text';
import { readCopilot, sendCopilot, viewCopilotCitation, type CopilotCitation, type CopilotIntent,
  type CopilotPage, type CopilotTurn } from '@/lib/copilot-api';

const secondary = 'tw:rounded-md tw:px-2 tw:py-1 tw:text-xs tw:font-semibold tw:text-blue-700 tw:hover:bg-blue-50 tw:focus-visible:outline-2 tw:focus-visible:outline-blue-600 tw:disabled:opacity-50';
const label = { QUEUED: 'Waiting to start…', RUNNING: 'Working on your question…',
  FAILED: 'Copilot couldn’t finish this request. You can ask again.', CANCELLED: 'This request was cancelled.' };
const activeReconcileMs = 5000;
const idleReconcileMs = 10000;

function mergeTurns(older: CopilotTurn[], newer: CopilotTurn[]) {
  const turns = new Map(older.map(turn => [turn.id, turn]));
  for (const turn of newer) turns.set(turn.id, turn);
  return [...turns.values()];
}

export type CopilotDraftSnapshot = { draft: string; pending: CopilotIntent | null };
const emptyDraft: CopilotDraftSnapshot = { draft: '', pending: null };

function citationText({ label, sourceLocation: location }: CopilotCitation) {
  return [label, location?.pages?.length ? `Source p. ${location.pages.join(', ')}` : null,
    location?.clause, location?.anchor].filter(Boolean).join(' · ');
}

export function StaffCopilotPanel({ id, csrfToken, open, memory, onSessionExpired }: {
  id: string; csrfToken: string; open: boolean; onSessionExpired: () => void;
  memory: Map<string, CopilotDraftSnapshot>;
}) {
  const [snapshot, setSnapshot] = useState(() => memory.get(id) ?? emptyDraft);
  const { draft, pending } = snapshot;
  const [page, setPage] = useState<CopilotPage | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [readError, setReadError] = useState('');
  const [sendError, setSendError] = useState('');
  const [documentError, setDocumentError] = useState('');
  const [sending, setSending] = useState(false);
  const [olderLoading, setOlderLoading] = useState(false);
  const [openingDocument, setOpeningDocument] = useState(false);
  const scope = useRef<AbortController | null>(null);
  const latestRead = useRef<AbortController | null>(null);
  const sendLock = useRef(false);
  const viewport = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const openRef = useRef(open);
  const focusOnOpen = useRef(open);
  const scrollToEnd = useRef(true);
  const olderCursor = page?.beforeCursor;
  const active = page?.activeRun;
  const activeRunId = active?.id;

  const saveDraft = useCallback((change: Partial<CopilotDraftSnapshot>) => {
    const next = { ...(memory.get(id) ?? emptyDraft), ...change };
    if (next.draft || next.pending) memory.set(id, next);
    else memory.delete(id);
    setSnapshot(next);
  }, [id, memory]);

  const suspendScope = useCallback(() => {
    scope.current?.abort();
    scope.current = new AbortController();
    sendLock.current = false;
    scrollToEnd.current = true;
    setPage(null);
    setReadError('');
    setSendError('');
    setDocumentError('');
    setSending(false);
    setOlderLoading(false);
    setOpeningDocument(false);
  }, []);

  const denyScope = useCallback((status: number) => {
    suspendScope();
    setAccessDenied(true);
    memory.delete(id);
    setSnapshot(emptyDraft);
    if (status === 401) onSessionExpired();
    else setReadError('Copilot is unavailable for this conversation.');
  }, [id, memory, onSessionExpired, suspendScope]);

  const refresh = useCallback(async (background = false) => {
    const currentScope = scope.current;
    if (!currentScope || currentScope.signal.aborted || !openRef.current) return;
    if (background && latestRead.current) return;
    latestRead.current?.abort();
    const request = new AbortController();
    latestRead.current = request;
    const signal = AbortSignal.any([currentScope.signal, request.signal]);
    try {
      const latest = await readCopilot(id, signal);
      if (signal.aborted || !openRef.current) return;
      const pendingId = memory.get(id)?.pending?.clientMessageId;
      if (pendingId && latest.items.some(turn => turn.question.clientMessageId === pendingId)) {
        saveDraft({ pending: null });
        setSendError('');
      }
      setPage(current => current && latest.items.some(turn => turn.id === current.items.at(-1)?.id)
        ? { ...latest, items: mergeTurns(current.items, latest.items), beforeCursor: current.beforeCursor }
        : latest);
      setAccessDenied(false);
      setReadError('');
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ConversationError && [401, 403, 404].includes(error.status)) {
        denyScope(error.status);
      } else {
        suspendScope();
        setReadError('Couldn’t load Copilot. Try again.');
      }
    } finally {
      if (latestRead.current === request) latestRead.current = null;
    }
  }, [id, memory, saveDraft, denyScope, suspendScope]);

  useEffect(() => {
    scope.current = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void refresh(), 80);
    };
    const invalidate = (event: Event) => {
      if ((event as CustomEvent<{ conversationId?: string }>).detail?.conversationId === id) schedule();
    };
    const recheck = () => { suspendScope(); schedule(); };
    const session = (event: Event) => {
      const type = (event as CustomEvent<{ type?: string }>).detail?.type;
      if (type === 'session-expired') { clearTimeout(timer); denyScope(401); }
      else if (type === 'invalidate') recheck();
    };
    const connection = (event: Event) => {
      if ((event as CustomEvent<{ connected?: boolean }>).detail?.connected) schedule();
    };
    const visible = () => { if (!document.hidden && openRef.current) recheck(); };
    window.addEventListener(copilotEvent, invalidate);
    window.addEventListener(chatScopeEvent, recheck);
    window.addEventListener(realtimeEvent, session);
    window.addEventListener(connectionEvent, connection);
    window.addEventListener('online', schedule);
    document.addEventListener('visibilitychange', visible);
    return () => {
      scope.current?.abort();
      clearTimeout(timer);
      window.removeEventListener(copilotEvent, invalidate);
      window.removeEventListener(chatScopeEvent, recheck);
      window.removeEventListener(realtimeEvent, session);
      window.removeEventListener(connectionEvent, connection);
      window.removeEventListener('online', schedule);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [id, suspendScope, denyScope, refresh]);

  useEffect(() => {
    openRef.current = open;
    if (!open) {
      latestRead.current?.abort();
      queueMicrotask(() => { if (!openRef.current) setPage(null); });
      return;
    }
    focusOnOpen.current = true;
    const loading = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(loading);
  }, [open, refresh]);

  useEffect(() => {
    if (!open || accessDenied) return;
    // A24 rechecks the source grant even when realtime misses an event and the panel is idle.
    const timer = setInterval(() => {
      if (!document.hidden) void refresh(true);
    }, activeRunId ? activeReconcileMs : idleReconcileMs);
    return () => clearInterval(timer);
  }, [open, accessDenied, activeRunId, refresh]);

  useEffect(() => {
    if (open && page && focusOnOpen.current) {
      focusOnOpen.current = false;
      textarea.current?.focus();
    }
    const history = viewport.current;
    if (open && history && scrollToEnd.current) history.scrollTop = history.scrollHeight;
  }, [page, open]);

  async function submit(intent: CopilotIntent, retry = false) {
    if (sendLock.current || !scope.current || !csrfToken || !page || readError || (!retry && (active || pending))) return;
    const { signal } = scope.current;
    sendLock.current = true;
    saveDraft(retry ? { pending: intent } : { pending: intent, draft: '' });
    setSending(true);
    setSendError('');
    scrollToEnd.current = true;
    try {
      const ack = await sendCopilot(id, intent, csrfToken, signal);
      if (signal.aborted) return;
      if (ack.status === 'QUEUED' || ack.status === 'RUNNING') {
        setPage(current => current && !current.activeRun && !current.items.some(turn => turn.id === ack.id)
          ? { ...current, activeRun: { id: ack.id, status: ack.status } }
          : current);
      }
      saveDraft({ pending: null });
      await refresh();
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ConversationError && [401, 403, 404].includes(error.status)) {
        denyScope(error.status);
      } else if (error instanceof ConversationError && error.status < 500 && error.status !== 429) {
        saveDraft({ pending: null, draft: memory.get(id)?.draft || intent.content });
        setSendError(error.code === 'COPILOT_BUSY' ? 'Copilot is already processing a question.'
          : error.code === 'IDEMPOTENCY_CONFLICT' ? 'This request key already belongs to another question.'
            : 'Copilot couldn’t accept the question. Check it and try again.');
        await refresh();
      } else if (memory.get(id)?.pending?.clientMessageId === intent.clientMessageId) {
        await refresh();
      }
    } finally {
      if (!signal.aborted) {
        sendLock.current = false;
        setSending(false);
      }
    }
  }

  async function loadOlder() {
    if (!olderCursor || olderLoading || !scope.current) return;
    const { signal } = scope.current;
    setOlderLoading(true);
    scrollToEnd.current = false;
    try {
      const older = await readCopilot(id, signal, olderCursor);
      if (!signal.aborted && openRef.current) setPage(current => current?.beforeCursor === olderCursor
        ? { ...current, items: mergeTurns(older.items, current.items), beforeCursor: older.beforeCursor } : current);
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ConversationError && [401, 403, 404].includes(error.status)) await refresh();
      else setReadError('Couldn’t load earlier questions. Try again.');
    } finally {
      if (!signal.aborted) setOlderLoading(false);
    }
  }

  async function openCitation(citation: CopilotCitation) {
    if (!scope.current || !csrfToken || openingDocument) return;
    const { signal } = scope.current;
    const tab = window.open('about:blank', '_blank');
    if (!tab) { setDocumentError('Allow pop-ups to open the source document.'); return; }
    tab.opener = null;
    setOpeningDocument(true);
    setDocumentError('');
    try {
      const grant = await viewCopilotCitation(citation, csrfToken, signal);
      if (signal.aborted) { tab.close(); return; }
      const url = new URL(grant.url);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid source URL');
      if (!tab.closed) tab.location.replace(url.toString());
    } catch {
      tab.close();
      if (!signal.aborted) setDocumentError('Source document is unavailable.');
    } finally {
      if (!signal.aborted) setOpeningDocument(false);
    }
  }

  const turns = page?.items ?? [];
  const count = page ? [...draft].length : 0;
  const canSend = Boolean(page && csrfToken && !active && !sending && !pending && !readError && draft.trim() && count <= 4000);
  function sendDraft() {
    if (canSend) void submit({ clientMessageId: crypto.randomUUID(), content: draft });
  }

  return <section className="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col" aria-label="Copilot conversation">
    <div ref={viewport} className="tw:min-h-0 tw:flex-1 tw:space-y-4 tw:overflow-y-auto tw:overscroll-contain tw:p-4"
      onScroll={() => { const el = viewport.current; if (el) scrollToEnd.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48; }}>
      {readError && <div role="alert" className="tw:text-sm tw:text-slate-700">
        {readError} <button type="button" className={secondary} onClick={() => void refresh()}>Retry</button>
      </div>}
      {!page && !readError && <p role="status" className="tw:text-sm tw:text-slate-600">Loading Copilot…</p>}
      {page && olderCursor && <button type="button" className={secondary} disabled={olderLoading} onClick={() => void loadOlder()}>Load earlier questions</button>}
      {page && turns.length === 0 && <p className="tw:text-sm tw:leading-relaxed tw:text-slate-600">Ask about this conversation, policy terms, or an insurance product.</p>}
      {turns.map(turn => <article key={turn.id} className="tw:space-y-2 tw:text-sm">
        <div className="tw:ml-5 tw:rounded-xl tw:bg-blue-50 tw:px-3 tw:py-2 tw:text-slate-900">
          <span className="tw:sr-only">You</span>
          <p className="tw:whitespace-pre-wrap tw:[overflow-wrap:anywhere]">{turn.question.content}</p>
        </div>
        {turn.answer ? <div className="tw:rounded-xl tw:border tw:border-slate-200 tw:bg-white tw:px-3 tw:py-2.5 tw:text-slate-800">
          <span className="tw:sr-only">Copilot</span>
          <p className="tw:whitespace-pre-wrap tw:leading-relaxed tw:[overflow-wrap:anywhere]"><AiReplyText text={turn.answer.content} /></p>
          {turn.answer.citations.length > 0 && <ul aria-label="Sources" className="tw:mt-2 tw:space-y-1">
            {turn.answer.citations.map((citation, index) => <li key={`${citation.versionId}:${index}`}>
              {citation.policyId || citation.productId
                ? <button type="button" className={secondary + ' tw:break-words tw:text-left'} disabled={openingDocument || !csrfToken} onClick={() => void openCitation(citation)}>{citationText(citation)}</button>
                : <span className="tw:break-words tw:text-xs tw:text-slate-600">{citationText(citation)}</span>}
            </li>)}
          </ul>}
        </div> : (turn.status === 'RUNNING' || turn.status === 'QUEUED') ? (
          <AiReplyIndicator label={label[turn.status]} />
        ) : turn.status !== 'COMPLETED' && (
          <p className="tw:px-3 tw:text-xs tw:text-slate-600">{label[turn.status]}</p>
        )}
      </article>)}
    </div>
    <form className="tw:shrink-0 tw:space-y-2 tw:border-t tw:border-slate-200 tw:bg-white tw:p-3"
      onSubmit={event => { event.preventDefault(); sendDraft(); }}>
      {documentError && <p role="alert" className="tw:text-xs tw:text-red-700">{documentError}</p>}
      {sendError && <p role="alert" className="tw:text-xs tw:text-red-700">{sendError}</p>}
      {page && pending && !sending && <>
        <p role="status" className="tw:text-xs tw:text-slate-700">Couldn’t confirm delivery. Retry the same question.</p>
        <button type="button" className={secondary} disabled={!csrfToken || Boolean(readError)} onClick={() => void submit(pending, true)}>Retry delivery</button>
      </>}
      {count > 4000 && <p role="alert" className="tw:text-xs tw:text-red-700">Keep your question under 4,000 characters.</p>}
      <div className="tw:flex tw:items-end tw:gap-2">
        <label className="tw:sr-only" htmlFor="copilot-question">Ask Copilot</label>
        <textarea ref={textarea} id="copilot-question" rows={2} value={page ? draft : ''} disabled={!page} placeholder="Ask Copilot"
          className="tw:min-w-0 tw:flex-1 tw:resize-none tw:rounded-lg tw:border tw:border-slate-300 tw:px-3 tw:py-2 tw:text-sm tw:text-slate-900 tw:placeholder:text-slate-500 tw:focus-visible:outline-2 tw:focus-visible:outline-blue-600"
          onChange={event => saveDraft({ draft: event.target.value })}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              sendDraft();
            }
          }} />
        <button type="submit" disabled={!canSend}
          className="tw:min-h-10 tw:shrink-0 tw:rounded-lg tw:bg-blue-700 tw:px-3 tw:py-1.5 tw:text-sm tw:font-semibold tw:text-white tw:hover:bg-blue-800 tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-blue-700 tw:disabled:bg-blue-100 tw:disabled:text-blue-950">
          {sending ? 'Sending…' : 'Send'}
        </button>
      </div>
    </form>
  </section>;
}
