'use client';
import Link from 'next/link';
import { useChatRefresh } from '@/lib/chat-realtime';
import { StaffNotifications } from './staff-notifications';
import { ConversationComposer, type ComposerSnapshot } from './conversation-composer';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { acceptConversation, ConversationError, conversationDetail, inboxFilter, reconcileAccept, type AcceptIntent, type Conversation, type ChatMessage } from '@/lib/conversation-api';
import { realtimeEvent } from '@/lib/realtime';
import { ConversationTranscript, inboxButton, type TranscriptSnapshot } from './conversation-transcript';
import { StaffInboxDirectory, type DirectorySnapshot } from './staff-inbox-directory';

function CollapseIcon({ open }: { open: boolean }) {
  return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/><path d={open ? 'm15 9-3 3 3 3' : 'm13 9 3 3-3 3'}/></svg>;
}
export function StaffInbox({ csrfToken, blocked }: { csrfToken: string; blocked: boolean }) {
  const params = useParams<{ conversationId?: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const query = useSearchParams();
  const selected = params.conversationId;
  const filter = inboxFilter(query.get('filter'));
  const applied = (query.get('search') ?? '').trim().slice(0, 100);
  const customerId = query.get('customerId') || undefined;
  const [draft, setDraft] = useState(applied);
  const [composing, setComposing] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [detail, setDetail] = useState<Conversation | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [revision, setRevision] = useState(0);
  const [directoryRevision, setDirectoryRevision] = useState(0);
  const [directoryEpoch, setDirectoryEpoch] = useState(0);
  const [denied, setDenied] = useState(false);
  const [composerMemory] = useState(() => new Map<string, ComposerSnapshot>());
  const [liveRevision, setLiveRevision] = useState(0);
  const [incoming, setIncoming] = useState<ChatMessage | null>(null);
  const [transcriptMemory] = useState(() => new Map<string, TranscriptSnapshot>());
  const [directoryMemory] = useState(() => new Map<string, DirectorySnapshot>());
  const directoryKey = `${filter}:${applied}:${customerId}`;
  const [directoryState, setDirectoryState] = useState(() => ({ key: directoryKey, value: { open: new Set<string>(), position: new Map<string, number>() } }));
  if (directoryState.key !== directoryKey) setDirectoryState({ key: directoryKey, value: directoryMemory.get(directoryKey) ?? { open: new Set<string>(), position: new Map<string, number>() } });
  useEffect(() => { directoryMemory.set(directoryState.key, directoryState.value); }, [directoryMemory, directoryState]);
  const intent = useRef<AcceptIntent | null>(null);
  const privacyEpoch = useRef(0);
  const metadataController = useRef<AbortController | null>(null);
  const acceptController = useRef<AbortController | null>(null);
  const acceptLock = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const searchEditing = useRef(false);
  useLayoutEffect(() => { searchEditing.current = false; }, [applied]);
  const currentId = useRef(selected);
  useLayoutEffect(() => { currentId.current = selected; }, [selected]);
  const href = (id?: string, nextFilter = filter, term = applied) => {
    const values = new URLSearchParams();
    if (nextFilter !== 'all') values.set('filter', nextFilter);
    if (term) values.set('search', term);
    if (customerId) values.set('customerId', customerId);
    return `/staff/inbox${id ? `/${encodeURIComponent(id)}` : ''}${values.size ? `?${values}` : ''}`;
  };
  const applySearch = useCallback((term: string) => {
    searchEditing.current = false;
    const values = new URLSearchParams(window.location.search);
    values.delete('page'); values.delete('cursor');
    const normalized = term.trim().slice(0, 100);
    if (normalized) values.set('search', normalized); else values.delete('search');
    const next = `${window.location.pathname}${values.size ? `?${values}` : ''}`;
    if (next !== `${window.location.pathname}${window.location.search}`) window.history.pushState(null, '', next);
  }, []);
  useEffect(() => { let disposed = false; queueMicrotask(() => { if (!disposed && !searchEditing.current) setDraft(applied); }); return () => { disposed = true; }; }, [applied]);
  useEffect(() => {
    if (!searchEditing.current || composing || draft.trim() === applied) return;
    const timer = setTimeout(() => { if (searchEditing.current) applySearch(draft); }, 300);
    return () => clearTimeout(timer);
  }, [draft, applied, composing, applySearch]);
  useEffect(() => {
    const raw = query.get('filter');
    if (raw && raw !== filter || raw === 'all') {
      const values = new URLSearchParams(query.toString());
      if (filter === 'all') values.delete('filter'); else values.set('filter', filter);
      window.history.replaceState(null, '', `${pathname}${values.size ? `?${values}` : ''}`);
    }
  }, [query, filter, pathname]);
  const onDenied = useCallback((failure: ConversationError) => {
    privacyEpoch.current++; setDirectoryEpoch(value => value + 1); metadataController.current?.abort();
    transcriptMemory.clear(); directoryMemory.clear(); composerMemory.clear();
    setDetail(null); setDenied(true); setError(failure.message);
    acceptController.current?.abort(); acceptLock.current = false; intent.current = null; setAccepting(false); setUncertain(false);
    if (failure.status === 401) router.replace('/staff/login');
  }, [router, setDetail, setDenied, setError, setAccepting, setUncertain, transcriptMemory, directoryMemory, composerMemory]);
  const clearLiveScope = useCallback(() => {
    privacyEpoch.current++; setDirectoryEpoch(value => value + 1);
    transcriptMemory.clear(); directoryMemory.clear(); composerMemory.clear(); metadataController.current?.abort(); acceptController.current?.abort(); acceptLock.current = false;
    setDetail(null); setIncoming(null); setAccepting(false); setLoading(false); setDirectoryRevision(value => value + 1);
  }, [transcriptMemory, directoryMemory, composerMemory, setDetail, setIncoming, setAccepting, setLoading, setDirectoryRevision]);
  const refreshLive = useCallback(async (signal: AbortSignal) => {
    const epoch = privacyEpoch.current;
    try {
      if (selected) { const result = await conversationDetail(selected, signal); if (!signal.aborted && epoch === privacyEpoch.current) { setDetail(result.conversation); setDenied(false); setLoading(false); setLiveRevision(value => value + 1); } }
      if (!signal.aborted && epoch === privacyEpoch.current) setDirectoryRevision(value => value + 1);
    } catch (failure) {
      if (signal.aborted || epoch !== privacyEpoch.current) return;
      if (failure instanceof ConversationError && [401, 403, 404].includes(failure.status)) onDenied(failure);
      else setError('Live updates could not be loaded. Please retry.');
    }
  }, [selected, onDenied, setDetail, setDenied, setLoading, setLiveRevision, setDirectoryRevision, setError]);
  useChatRefresh(refreshLive, clearLiveScope, !blocked);
  useEffect(() => {
    const invalidate = (event: Event) => {
      const type = (event as CustomEvent<{ type: string }>).detail?.type;
      if (type === 'invalidate' || type === 'session-expired') { privacyEpoch.current++; setDirectoryEpoch(value => value + 1); metadataController.current?.abort(); transcriptMemory.clear(); directoryMemory.clear(); composerMemory.clear(); setDetail(null); setDirectoryRevision(value => value + 1); setRevision(value => value + 1); }
    };
    window.addEventListener(realtimeEvent, invalidate);
    return () => window.removeEventListener(realtimeEvent, invalidate);
  }, [onDenied, transcriptMemory, directoryMemory, composerMemory]);
  useEffect(() => {
    acceptController.current?.abort(); acceptLock.current = false; intent.current = null;
    let disposed = false; queueMicrotask(() => { if (!disposed) { setAccepting(false); setUncertain(false); setIncoming(null); setDetail(null); setDenied(false); setError(''); } });
    return () => { disposed = true; };
  }, [selected]);
  useEffect(() => {
    if (!selected || blocked) return;
    const abort = new AbortController(); const epoch = privacyEpoch.current; metadataController.current = abort; queueMicrotask(() => { if (!abort.signal.aborted) setLoading(true); });
    conversationDetail(selected, abort.signal).then(result => {
      if (!abort.signal.aborted && epoch === privacyEpoch.current) { setDetail(result.conversation); setDenied(false); }
    }).catch(failure => {
      if (abort.signal.aborted || epoch !== privacyEpoch.current) return;
      if (failure instanceof ConversationError && [401, 403, 404].includes(failure.status)) onDenied(failure);
      else setError(failure instanceof ConversationError ? failure.message : 'Unable to load this conversation. Retry to continue.');
    }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [selected, revision, blocked, onDenied]);
  useEffect(() => {
    if (!blocked) return;
    acceptController.current?.abort(); transcriptMemory.clear(); directoryMemory.clear(); composerMemory.clear();
    let disposed = false;
    queueMicrotask(() => { if (!disposed) { setDetail(null); setAccepting(false); acceptLock.current = false; } });
    return () => { disposed = true; };
  }, [blocked, transcriptMemory, directoryMemory, composerMemory]);
  useEffect(() => () => acceptController.current?.abort(), []);
  const accept = async () => {
    if (!detail || !selected || acceptLock.current || blocked) return;
    acceptLock.current = true; setAccepting(true); setError('');
    const id = selected;
    const command = intent.current ?? { clientRequestId: crypto.randomUUID(), expectedVersion: detail.controlVersion };
    intent.current = command;
    const abort = new AbortController(); acceptController.current = abort;
    try {
      if (uncertain) {
        try {
          await reconcileAccept(id, command, abort.signal);
          const result = await conversationDetail(id, abort.signal);
          if (!abort.signal.aborted && currentId.current === id) { setDetail(result.conversation); setUncertain(false); intent.current = null; setDirectoryRevision(value => value + 1); }
          return;
        } catch (failure) { if (!(failure instanceof ConversationError && failure.status === 404)) throw failure; }
      }
      const result = await acceptConversation(id, command, csrfToken, abort.signal);
      if (!abort.signal.aborted && currentId.current === id) { setDetail(result.conversation); setUncertain(false); intent.current = null; setDirectoryRevision(value => value + 1); }
    } catch (failure) {
      if (abort.signal.aborted || currentId.current !== id) return;
      if (failure instanceof ConversationError && [401, 403, 404].includes(failure.status)) onDenied(failure);
      else if (failure instanceof ConversationError && failure.status === 409) { intent.current = null; setUncertain(false); setError(failure.message); setRevision(value => value + 1); }
      else { setUncertain(true); setError('Acceptance could not be confirmed. Check the result before continuing.'); }
    } finally { if (!abort.signal.aborted && currentId.current === id) { acceptLock.current = false; setAccepting(false); } }
  };
  const visible = !blocked && !denied && detail?.id === selected ? detail : null;
  return <section aria-label="Staff inbox" className="tw:flex tw:min-h-0 tw:min-w-0 tw:flex-1 tw:overflow-hidden tw:bg-white tw:max-[1000px]:h-[75dvh] tw:max-[1000px]:flex-none">
    <aside aria-label="Conversation directory" className={(collapsed ? 'tw:hidden' : selected ? 'tw:hidden tw:lg:flex' : 'tw:flex') + ' tw:min-h-0 tw:w-full tw:shrink-0 tw:flex-col tw:border-r tw:border-slate-200 tw:lg:w-80'}>
      <header className="tw:shrink-0 tw:border-b tw:border-slate-200 tw:p-4">
        <div className="tw:mb-4 tw:flex tw:items-center tw:justify-between tw:gap-3"><h1 className="tw:text-lg tw:font-semibold">Inbox</h1><StaffNotifications csrfToken={csrfToken} onDenied={onDenied}/><button className={inboxButton + ' tw:hidden! tw:lg:inline-flex!'} aria-label="Collapse conversation directory" title="Collapse conversation directory" aria-expanded={!collapsed} onClick={() => setCollapsed(true)}><CollapseIcon open/></button></div>
        <nav aria-label="Conversation filters" className="tw:mb-4 tw:flex tw:gap-2">{(['all', 'requests', 'active'] as const).map(value => <Link key={value} href={href(selected, value)} prefetch={false} aria-current={filter === value ? 'page' : undefined} className={'tw:rounded-lg tw:px-3 tw:py-2 tw:text-sm tw:no-underline ' + (filter === value ? 'tw:bg-blue-50 tw:font-semibold tw:text-blue-700' : 'tw:text-slate-600 tw:hover:bg-slate-100')}>{value === 'all' ? 'All' : value === 'requests' ? 'Requests' : 'Active'}</Link>)}</nav>
        <label htmlFor="inbox-search" className="tw:sr-only">Search customers</label><input ref={input} id="inbox-search" type="search" placeholder="Customer name or code" maxLength={100} value={draft} onChange={event => { searchEditing.current = true; setDraft(event.target.value); }} onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); applySearch(draft); } }} className="tw:w-full tw:rounded-lg tw:border tw:border-slate-300 tw:bg-white tw:px-3 tw:py-2.5 tw:text-sm tw:text-slate-900 tw:placeholder:text-slate-500 tw:focus:outline-2 tw:focus:outline-blue-600"/>
      </header>
      {!blocked && !denied && <StaffInboxDirectory key={`${directoryKey}:${directoryEpoch}`} refreshToken={directoryRevision} filter={filter} search={applied} customerId={customerId} selected={selected} selectedCustomerId={visible?.customer.id} href={href} memory={directoryState.value} onDenied={onDenied}/>}
    </aside>
    <div className={(selected || collapsed ? 'tw:flex' : 'tw:hidden tw:lg:flex') + ' tw:min-h-0 tw:min-w-0 tw:flex-1 tw:flex-col'}>
      <header className="tw:flex tw:shrink-0 tw:items-center tw:gap-3 tw:border-b tw:border-slate-200 tw:bg-white tw:px-5 tw:py-3">
        {collapsed && <button className={inboxButton} aria-label="Expand conversation directory" title="Expand conversation directory" aria-expanded={false} onClick={() => setCollapsed(false)}><CollapseIcon open={false}/></button>}
        {selected && <Link href={href()} className="tw:text-sm tw:text-blue-700 tw:lg:hidden">Inbox list</Link>}
        <div className="tw:min-w-0 tw:flex-1"><h2 className="tw:truncate tw:text-base tw:font-semibold">{visible?.customer.fullName ?? 'Conversations'}</h2>{visible && <p className="tw:mt-1 tw:text-xs tw:text-slate-600">{visible.customer.accountCode} · {visible.status === 'PENDING_HANDOFF' ? 'Awaiting staff' : 'Staff active'}</p>}</div>
      </header>
      {error && <div role="alert" className="tw:shrink-0 tw:border-b tw:border-red-100 tw:bg-red-50 tw:px-5 tw:py-3 tw:text-sm tw:text-red-800">{error}{<button className={inboxButton + ' tw:ml-3!'} onClick={() => { setDenied(false); setError(''); setDirectoryRevision(value => value + 1); setRevision(value => value + 1); }}>Retry inbox</button>}</div>}
      {blocked ? <p role="alert" className="tw:p-6 tw:text-sm">Session verification is required before viewing conversations.</p> : loading && !visible ? <p role="status" className="tw:p-6 tw:text-sm tw:text-slate-600">Loading conversation…</p> : visible ? <>
        <div className="tw:shrink-0 tw:border-b tw:border-slate-200 tw:px-5 tw:py-3"><h3 className="tw:break-words tw:text-sm tw:font-medium">{visible.subject || 'Conversation'}</h3></div>
        {visible.allowedActions.readMessages ? <ConversationTranscript key={visible.id} id={visible.id} memory={transcriptMemory} incoming={incoming} refreshToken={liveRevision} onDenied={onDenied}/> : <div className="tw:min-h-0 tw:flex-1 tw:overflow-auto tw:p-6"><h3 className="tw:text-base tw:font-semibold">Customer requested your support</h3><p className="tw:mt-3 tw:max-w-prose tw:text-sm tw:leading-6 tw:text-slate-600">Accept this request to view the entire conversation shared by the customer, including earlier messages with the AI assistant.</p>{visible.request?.sharedReason && <p className="tw:mt-4 tw:max-w-prose tw:whitespace-pre-wrap tw:break-words tw:text-sm">{visible.request.sharedReason}</p>}{visible.allowedActions.accept && <button className={inboxButton + ' tw:mt-5! tw:border-blue-600! tw:bg-blue-600! tw:text-white! tw:hover:bg-blue-700!'} disabled={accepting || !csrfToken} onClick={() => void accept()}>{accepting ? 'Checking acceptance…' : uncertain ? 'Check acceptance result' : 'Accept request'}</button>}</div>}
        {visible.allowedActions.readMessages && visible.allowedActions.send && <ConversationComposer key={visible.id} id={visible.id} role="STAFF" version={visible.controlVersion} csrfToken={csrfToken} memory={composerMemory} onMessage={message => { setIncoming(message); setDirectoryRevision(value => value + 1); }} onDenied={onDenied} onStale={() => { setDetail(null); setRevision(value => value + 1); }}/>}
      </> : !selected && <div className="tw:flex tw:flex-1 tw:items-center tw:justify-center tw:p-8"><p className="tw:max-w-sm tw:text-center tw:text-sm tw:leading-6 tw:text-slate-600">Choose a customer and conversation to view their messages or accept a support request.</p></div>}
    </div>
  </section>;
}
