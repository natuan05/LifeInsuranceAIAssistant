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
  useLayoutEffect(() => {
    sync.current = async () => {
      if (lock.current) { dirty.current = true; return; }
      dirty.current = false;
      if (pageRef.current) {
        const abort = new AbortController();
        try {
          const result = await conversationMessages(id, {}, abort.signal, role);
          setMessages(current => mergeMessages(current, result.items));
          const element = viewport.current;
          const atBottom = !element || element.scrollHeight - element.clientHeight - element.scrollTop < 80;
          if (atBottom) anchor.current = 'bottom';
        } catch {
          // Fallback to load after if latest fetch fails
          void load('after');
        }
      } else {
        void load('initial');
      }
    };
  }, [id, load, role]);
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
    <div ref={viewport} role="region" aria-label="Conversation messages" tabIndex={0} className="tw:min-h-0 tw:flex-1 tw:overflow-y-auto tw:overscroll-contain tw:bg-slate-50/70 tw:p-5 tw:focus-visible:outline-2 tw:focus-visible:outline-blue-600" onScroll={() => {
      const element = viewport.current;
      if (element && element.scrollTop < 100 && pageRef.current?.hasMoreBefore && !lock.current) void load('before');
      if (element && element.scrollHeight - element.clientHeight - element.scrollTop < 80) setJump(false);
    }}>
      {page?.hasMoreBefore && <div className="tw:mb-5 tw:text-center"><button disabled={pending} className={inboxButton} onClick={() => void load('before')}>Load earlier messages</button></div>}
      {pending && <p role="status" className="tw:py-2 tw:text-center tw:text-sm tw:text-slate-600">Loading messages…</p>}
      {error && <div role="alert" className="tw:mb-4 tw:rounded-lg tw:bg-red-50 tw:p-3 tw:text-sm tw:text-red-800">{error} <button className={inboxButton} onClick={() => void load(lastDirection.current)}>Retry messages</button></div>}
      {!pending && !error && !messages.length && <p className="tw:text-center tw:text-sm tw:text-slate-600">No messages yet.</p>}
      <ol className="tw:flex tw:list-none tw:flex-col tw:gap-4 tw:p-0 tw:m-0" aria-label="Messages">
        {messages.map(message => {
          const isMe = message.senderType === role;
          const isSystem = message.senderType === 'SYSTEM';
          const isAgent = message.senderType === 'AI_AGENT';
          const senderName = isAgent ? 'AI Assistant' : isSystem ? 'System' : message.sender?.displayName || (isMe ? 'Staff' : 'Customer');
          const isProposal = isAgent && (message.content.includes('Ticket') || message.content.includes('policy') || message.content.includes('insurance'));
          
          if (isSystem) {
            return (
              <li key={message.id} data-message-id={message.id} data-sequence={message.sequence} className="tw:self-center tw:max-w-md tw:text-center tw:my-1">
                <span className="tw:inline-flex tw:items-center tw:gap-1.5 tw:rounded-full tw:bg-slate-100 tw:border tw:border-slate-200/60 tw:px-3 tw:py-1 tw:text-xs tw:text-slate-600">
                  <span className="tw:w-1.5 tw:h-1.5 tw:rounded-full tw:bg-slate-400" />
                  <span>{message.content}</span>
                  <time dateTime={message.createdAt} className="tw:text-[10px] tw:text-slate-400">· {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
                </span>
              </li>
            );
          }

          return (
            <li key={message.id} data-message-id={message.id} data-sequence={message.sequence} className={`tw:flex tw:items-end tw:gap-2.5 tw:max-w-[85%] ${isMe ? 'tw:self-end' : 'tw:self-start'}`}>
              {!isMe && (
                <div className={`tw:grid tw:place-items-center tw:w-8 tw:h-8 tw:rounded-full tw:shrink-0 tw:text-xs tw:font-semibold tw:shadow-2xs ${isAgent ? 'tw:bg-indigo-600 tw:text-white' : 'tw:bg-blue-100 tw:text-blue-700'}`}>
                  {isAgent ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                  ) : (
                    <span>{senderName.slice(0, 1).toUpperCase()}</span>
                  )}
                </div>
              )}
              <div className={`tw:flex tw:flex-col ${isMe ? 'tw:items-end' : 'tw:items-start'}`}>
                <p className="tw:mb-1 tw:text-[11px] tw:text-slate-400 tw:flex tw:items-center tw:gap-1.5">
                  {isAgent && <span className="tw:font-semibold tw:text-indigo-600">AI Assistant ·</span>}
                  <time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
                </p>
                {isProposal ? (
                  <div className="tw:rounded-2xl tw:rounded-tl-xs tw:border-2 tw:border-blue-400/80 tw:bg-white tw:p-4 tw:shadow-xs tw:max-w-lg tw:text-slate-900">
                    <div className="tw:flex tw:items-center tw:justify-between tw:gap-3 tw:pb-3 tw:border-b tw:border-slate-100">
                      <div className="tw:flex tw:items-center tw:gap-2">
                        <span className="tw:grid tw:place-items-center tw:w-6 tw:h-6 tw:rounded-md tw:bg-indigo-50 tw:text-indigo-600">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        </span>
                        <span className="tw:text-xs tw:font-bold tw:text-slate-900">Insurance Ticket Proposal</span>
                      </div>
                      <span className="tw:text-[11px] tw:font-semibold tw:font-mono tw:bg-blue-50 tw:text-blue-700 tw:border tw:border-blue-200/60 tw:rounded-full tw:px-2.5 tw:py-0.5">#TK-SUPPORT</span>
                    </div>
                    <div className="tw:py-3 tw:text-xs tw:leading-relaxed tw:whitespace-pre-wrap tw:break-words tw:[overflow-wrap:anywhere] tw:text-slate-700">
                      {message.content}
                    </div>
                    <div className="tw:flex tw:items-center tw:gap-2 tw:pt-2.5 tw:border-t tw:border-slate-100 tw:text-[11px] tw:font-medium tw:text-emerald-700 tw:bg-emerald-50/50 tw:-mx-4 tw:-mb-4 tw:px-4 tw:py-2.5 tw:rounded-b-xl">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="tw:text-emerald-600 tw:shrink-0"><polyline points="20 6 9 17 4 12"/></svg>
                      <span>Verified securely via Core Backend</span>
                    </div>
                  </div>
                ) : (
                  <div className={`tw:rounded-2xl tw:px-4 tw:py-3 tw:text-sm tw:leading-relaxed tw:whitespace-pre-wrap tw:break-words tw:[overflow-wrap:anywhere] tw:shadow-xs ${isMe ? 'tw:bg-[#0f172a] tw:text-white tw:rounded-tr-xs' : 'tw:bg-white tw:border tw:border-slate-200/80 tw:text-slate-900 tw:rounded-tl-xs'}`}>
                    {message.content}
                  </div>
                )}
                {!!message.citations?.length && (
                  <ul className="tw:mt-2 tw:flex tw:flex-wrap tw:gap-1.5 tw:list-none tw:p-0 tw:m-0">
                    {message.citations.map((citation, index) => (
                      <li key={index} className="tw:inline-flex tw:items-center tw:gap-1 tw:rounded-md tw:bg-blue-50 tw:border tw:border-blue-200/60 tw:px-2 tw:py-0.5 tw:text-[10px] tw:font-medium tw:text-blue-700">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        <span>{citation.label}{citation.page ? ` · p. ${citation.page}` : ''}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {isMe && (
                  <div className="tw:mt-1 tw:flex tw:items-center tw:gap-1 tw:text-[10px] tw:text-slate-400">
                    {message.readAt ? (
                      <>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="tw:text-blue-500">
                          <polyline points="20 6 9 17 4 12"/>
                          <polyline points="20 12 15 17 10 12"/>
                        </svg>
                        <span className="tw:text-blue-600 tw:font-medium">Đã xem</span>
                      </>
                    ) : (
                      <>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="tw:text-slate-400">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        <span>Đã gửi</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {page?.hasMoreAfter && <button className={inboxButton + ' tw:mt-4!'} disabled={pending} onClick={() => void load('after')}>Load newer messages</button>}
    </div>
    {jump && <button className={inboxButton} onClick={() => { viewport.current?.scrollTo({ top: viewport.current.scrollHeight, behavior: 'smooth' }); setJump(false); }}>Jump to latest</button>}
  </div>;
}
