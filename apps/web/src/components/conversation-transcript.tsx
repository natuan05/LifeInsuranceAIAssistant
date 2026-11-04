'use client';
import { connectionEvent } from '@/lib/chat-realtime';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ConversationError, conversationMessages, mergeMessages, type ChatMessage, type MessagePage } from '@/lib/conversation-api';

export const inboxButton = 'tw:rounded-lg tw:border tw:border-slate-300 tw:bg-white tw:px-3 tw:py-2 tw:text-sm tw:font-medium tw:text-slate-700 tw:hover:bg-slate-100 tw:disabled:opacity-50 tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-blue-600';
export type TranscriptSnapshot = { messages: ChatMessage[]; page: MessagePage['pageInfo'] | null; top: number };
export function ConversationTranscript({ id, memory, onDenied, role = 'STAFF', incoming, refreshToken = 0 }: { id: string; role?: 'STAFF' | 'CUSTOMER'; incoming?: ChatMessage | null; refreshToken?: number; memory: Map<string, TranscriptSnapshot>; onDenied: (error: ConversationError) => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => memory.get(id)?.messages ?? []);
  const [page, setPage] = useState<MessagePage['pageInfo'] | null>(() => memory.get(id)?.page ?? null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [jump, setJump] = useState(false);
  const [connected, setConnected] = useState(true);
  const dirty = useRef(false);
  const sync = useRef<() => void>(() => {});
  const viewport = useRef<HTMLDivElement>(null);
  const controller = useRef<AbortController | null>(null);
  const lock = useRef(false);
  const lastDirection = useRef<'initial' | 'before' | 'after'>('initial');
  const anchor = useRef<{ height: number; top: number } | 'bottom' | null>(null);
  const pageRef = useRef(page);
  useLayoutEffect(() => { pageRef.current = page; }, [page]);
  useLayoutEffect(() => {
    const element = viewport.current;
    const saved = memory.get(id);
    if (element && saved) element.scrollTop = saved.top;
    return () => { if (element) { const snapshot = memory.get(id); if (snapshot) snapshot.top = element.scrollTop; } };
  }, [id, memory]);
  useLayoutEffect(() => { memory.set(id, { messages, page, top: viewport.current?.scrollTop ?? 0 }); }, [id, memory, messages, page]);
  const load = useCallback(async (direction: 'initial' | 'before' | 'after') => {
    if (lock.current) return;
    const previous = pageRef.current;
    if (direction !== 'initial' && !previous) return;
    lock.current = true; setPending(true); setError('');
    lastDirection.current = direction;
    const abort = new AbortController(); controller.current = abort;
    try {
      const result = await conversationMessages(id, direction === 'before' ? { before: previous!.beforeCursor! } : direction === 'after' ? { after: previous!.afterCursor } : {}, abort.signal, role);
      if (abort.signal.aborted) return;
      const element = viewport.current;
      const atBottom = !element || element.scrollHeight - element.clientHeight - element.scrollTop < 80;
      anchor.current = direction === 'before' && element ? { height: element.scrollHeight, top: element.scrollTop } : direction === 'initial' || atBottom ? 'bottom' : null;
      if (direction === 'after' && result.items.length && !atBottom) setJump(true);
      setMessages(current => mergeMessages(direction === 'initial' ? [] : current, result.items));
      const current = pageRef.current;
      const next = direction === 'before' && current ? { ...current, beforeCursor: result.pageInfo.beforeCursor, hasMoreBefore: result.pageInfo.hasMoreBefore } : direction === 'after' && current ? { ...result.pageInfo, beforeCursor: current.beforeCursor, hasMoreBefore: current.hasMoreBefore } : result.pageInfo;
      pageRef.current = next; setPage(next);
      if (direction === 'after' && result.pageInfo.hasMoreAfter) dirty.current = true;
    } catch (failure) {
      if (abort.signal.aborted) return;
      if (failure instanceof ConversationError && [401, 403, 404].includes(failure.status)) { setMessages([]); setPage(null); onDenied(failure); }
      else setError(failure instanceof ConversationError ? failure.message : 'Unable to load messages. Retry to continue.');
    } finally { if (!abort.signal.aborted) { lock.current = false; setPending(false); if (dirty.current) queueMicrotask(() => sync.current()); } }
  }, [id, onDenied, role]);
  useLayoutEffect(() => { sync.current = () => { if (lock.current) { dirty.current = true; return; } dirty.current = false; void load(pageRef.current ? 'after' : 'initial'); }; }, [load]);
  useEffect(() => {
    if (!refreshToken) return;
    let disposed = false; queueMicrotask(() => { if (!disposed) sync.current(); });
    return () => { disposed = true; };
  }, [refreshToken]);
  useEffect(() => {
    const changed = (event: Event) => setConnected(Boolean((event as CustomEvent<{ connected: boolean }>).detail.connected));
    window.addEventListener(connectionEvent, changed); return () => window.removeEventListener(connectionEvent, changed);
  }, []);
  useEffect(() => { let disposed = false; queueMicrotask(() => { if (!disposed) void load(pageRef.current ? 'after' : 'initial'); }); return () => { disposed = true; controller.current?.abort(); lock.current = false; }; }, [load]);
  useEffect(() => {
    if (!incoming) return;
    let disposed = false;
    queueMicrotask(() => { if (!disposed) { anchor.current = 'bottom'; setMessages(current => mergeMessages(current, [incoming])); } });
    return () => { disposed = true; };
  }, [incoming]);
  useLayoutEffect(() => {
    const element = viewport.current;
    if (element && anchor.current) element.scrollTop = anchor.current === 'bottom' ? element.scrollHeight : anchor.current.top + element.scrollHeight - anchor.current.height;
    anchor.current = null;
  }, [messages]);
  return <div className="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col">
    {!connected && <p role="status" className="tw:shrink-0 tw:bg-amber-50 tw:px-5 tw:py-2 tw:text-xs tw:text-amber-900">Reconnecting live updates. Your messages can still be sent.</p>}
    <div className="tw:flex tw:shrink-0 tw:items-center tw:justify-between tw:gap-3 tw:border-b tw:border-slate-200 tw:bg-white tw:px-5 tw:py-2">
      <p className="tw:text-xs tw:text-slate-600">Conversation history</p>
    </div>
    <div ref={viewport} role="region" aria-label="Conversation messages" tabIndex={0} className="tw:min-h-0 tw:flex-1 tw:overflow-y-auto tw:overscroll-contain tw:bg-slate-50 tw:p-5 tw:focus-visible:outline-2 tw:focus-visible:outline-blue-600" onScroll={() => {
      const element = viewport.current;
      if (element && element.scrollTop < 100 && pageRef.current?.hasMoreBefore && !lock.current) void load('before');
      if (element && element.scrollHeight - element.clientHeight - element.scrollTop < 80) setJump(false);
    }}>
      {page?.hasMoreBefore && <div className="tw:mb-5 tw:text-center"><button disabled={pending} className={inboxButton} onClick={() => void load('before')}>Load earlier messages</button></div>}
      {pending && <p role="status" className="tw:py-2 tw:text-center tw:text-sm tw:text-slate-600">Loading messages…</p>}
      {error && <div role="alert" className="tw:mb-4 tw:rounded-lg tw:bg-red-50 tw:p-3 tw:text-sm tw:text-red-800">{error} <button className={inboxButton} onClick={() => void load(lastDirection.current)}>Retry messages</button></div>}
      {!pending && !error && !messages.length && <p className="tw:text-center tw:text-sm tw:text-slate-600">No messages yet.</p>}
      <ol className="tw:flex tw:list-none tw:flex-col tw:gap-5" aria-label="Messages">
        {messages.map(message => <li key={message.id} data-message-id={message.id} data-sequence={message.sequence} className={message.senderType === 'SYSTEM' ? 'tw:self-center tw:max-w-full tw:text-center' : message.senderType === role ? 'tw:max-w-[85%] tw:self-end' : 'tw:max-w-[85%] tw:self-start'}>
          <p className="tw:mb-1 tw:text-xs tw:text-slate-600">{message.senderType === 'AI_AGENT' ? 'AI assistant' : message.senderType === 'SYSTEM' ? 'System' : message.sender.displayName} · <time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString()}</time></p>
          <div className={'tw:rounded-xl tw:px-4 tw:py-3 tw:text-sm tw:leading-6 tw:whitespace-pre-wrap tw:break-words tw:[overflow-wrap:anywhere] ' + (message.senderType === 'SYSTEM' ? 'tw:text-slate-600' : message.senderType === role ? 'tw:bg-blue-600 tw:text-white' : 'tw:border tw:border-slate-200 tw:bg-white tw:text-slate-900')}>{message.content}</div>
          {!!message.citations?.length && <ul className="tw:mt-2 tw:list-none tw:text-xs tw:text-slate-600">{message.citations.map((citation, index) => <li key={index}>{citation.label}{citation.page ? ` · p. ${citation.page}` : ''}</li>)}</ul>}
        </li>)}
      </ol>
      {page?.hasMoreAfter && <button className={inboxButton + ' tw:mt-4!'} disabled={pending} onClick={() => void load('after')}>Load newer messages</button>}
    </div>
    {jump && <button className={inboxButton} onClick={() => { viewport.current?.scrollTo({ top: viewport.current.scrollHeight, behavior: 'smooth' }); setJump(false); }}>Jump to latest</button>}
  </div>;
}
