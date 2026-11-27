'use client';
import Link from 'next/link';
import { useChatRefresh } from '@/lib/chat-realtime';
import { ConversationComposer, type ComposerSnapshot } from './conversation-composer';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { acceptConversation, ConversationError, conversationDetail, inboxFilter, markConversationRead, reconcileAccept, reconcileTakeover, takeoverConversation, type AcceptIntent, type Conversation, type ChatMessage } from '@/lib/conversation-api';
import { realtimeEvent } from '@/lib/realtime';
import { ConversationTranscript, inboxButton, type TranscriptSnapshot } from './conversation-transcript';
import { StaffInboxDirectory, type DirectorySnapshot } from './staff-inbox-directory';
import { StaffInboxPolicyLookup } from './staff-inbox-policy-lookup';
import { StaffCopilotPanel, type CopilotDraftSnapshot } from './staff-copilot-panel';

const copilotWidths = ['tw:lg:w-1/4', 'tw:lg:w-[30%]', 'tw:lg:w-[35%]', 'tw:lg:w-[40%]', 'tw:lg:w-[45%]', 'tw:lg:w-1/2'] as const;

function CollapseIcon({ open }: { open: boolean }) {
  return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/><path d={open ? 'm15 9-3 3 3 3' : 'm13 9 3 3-3 3'}/></svg>;
}

function formatTime(iso?: string) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
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
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [rightPanelTab, setRightPanelTab] = useState<'details' | 'agent' | 'lookup'>('details');
  const copilotTrigger = useRef<HTMLButtonElement | null>(null);
  const chatLayout = useRef<HTMLDivElement>(null);
  const [copilotWidth, setCopilotWidth] = useState(2);
  const resizeCopilot = (step: number) => setCopilotWidth(Math.max(0, Math.min(copilotWidths.length - 1, step)));
  const copilotOpen = rightPanelOpen && rightPanelTab === 'agent';
  const toggleCopilot = (trigger: HTMLButtonElement) => {
    copilotTrigger.current = trigger;
    setRightPanelTab('agent');
    setRightPanelOpen(!copilotOpen);
  };
  const closeCopilot = () => {
    setRightPanelOpen(false);
    copilotTrigger.current?.focus();
  };
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
  const [copilotMemory] = useState(() => new Map<string, CopilotDraftSnapshot>());
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
    if (next !== `${window.location.pathname}${window.location.search}`) {
      window.history.pushState(null, '', next);
    }
  }, []);
  useEffect(() => {
    const onPop = () => {
      const term = (new URLSearchParams(window.location.search).get('search') ?? '').trim().slice(0, 100);
      searchEditing.current = false;
      setDraft(term);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  useEffect(() => {
    let disposed = false;
    queueMicrotask(() => {
      const current = (new URLSearchParams(window.location.search).get('search') ?? '').trim().slice(0, 100);
      if (!disposed && !searchEditing.current && current === applied) setDraft(applied);
    });
    return () => { disposed = true; };
  }, [applied]);
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
    if (failure.status === 401) copilotMemory.clear();
    else if (currentId.current) copilotMemory.delete(currentId.current);
    setDetail(null); setDenied(true); setError(failure.message);
    acceptController.current?.abort(); acceptLock.current = false; intent.current = null; setAccepting(false); setUncertain(false);
    if (failure.status === 401) router.replace('/staff/login');
  }, [router, setDetail, setDenied, setError, setAccepting, setUncertain, transcriptMemory, directoryMemory, composerMemory, copilotMemory]);
  const onCopilotSessionExpired = useCallback(() => onDenied(new ConversationError(401, 'UNAUTHORIZED')), [onDenied]);
  const clearLiveScope = useCallback(() => {
    privacyEpoch.current++; setDirectoryEpoch(value => value + 1);
    transcriptMemory.clear(); directoryMemory.clear(); composerMemory.clear(); metadataController.current?.abort(); acceptController.current?.abort(); acceptLock.current = false;
    setDetail(null); setIncoming(null); setAccepting(false); setLoading(false); setDirectoryRevision(value => value + 1);
  }, [transcriptMemory, directoryMemory, composerMemory, setDetail, setIncoming, setAccepting, setLoading, setDirectoryRevision]);
  const refreshLive = useCallback(async (signal: AbortSignal) => {
    const epoch = privacyEpoch.current;
    try {
      if (selected) {
        const result = await conversationDetail(selected, signal);
        if (!signal.aborted && epoch === privacyEpoch.current) {
          setDetail(result.conversation);
          setDenied(false);
          setLoading(false);
          setLiveRevision(value => value + 1);
          if (result.conversation.allowedActions.canSend) {
            void markConversationRead('STAFF', selected, csrfToken, signal).catch(() => { if (!signal.aborted && epoch === privacyEpoch.current) setError('Unable to update read status. Refresh the conversation to retry.'); });
          }
          if (!result.conversation.allowedActions.canView) copilotMemory.delete(selected);
        }
      }
      if (!signal.aborted && epoch === privacyEpoch.current) setDirectoryRevision(value => value + 1);
    } catch (failure) {
      if (signal.aborted || epoch !== privacyEpoch.current) return;
      if (failure instanceof ConversationError && [401, 403, 404].includes(failure.status)) onDenied(failure);
      else setError('Live updates could not be loaded. Please retry.');
    }
  }, [selected, csrfToken, onDenied, setDetail, setDenied, setLoading, setLiveRevision, setDirectoryRevision, setError, copilotMemory]);
  useChatRefresh(refreshLive, clearLiveScope, !blocked);
  useEffect(() => {
    const invalidate = (event: Event) => {
      const type = (event as CustomEvent<{ type: string }>).detail?.type;
      if (type === 'session-expired') copilotMemory.clear();
      if (type === 'invalidate' || type === 'session-expired') { privacyEpoch.current++; setDirectoryEpoch(value => value + 1); metadataController.current?.abort(); transcriptMemory.clear(); directoryMemory.clear(); composerMemory.clear(); setDetail(null); setDirectoryRevision(value => value + 1); setRevision(value => value + 1); }
    };
    window.addEventListener(realtimeEvent, invalidate);
    return () => window.removeEventListener(realtimeEvent, invalidate);
  }, [transcriptMemory, directoryMemory, composerMemory, copilotMemory]);
  useEffect(() => {
    acceptController.current?.abort(); acceptLock.current = false; intent.current = null;
    let disposed = false; queueMicrotask(() => { if (!disposed) { setAccepting(false); setUncertain(false); setIncoming(null); setDetail(null); setDenied(false); setError(''); } });
    return () => { disposed = true; };
  }, [selected]);
  useEffect(() => {
    if (!selected || blocked) return;
    const abort = new AbortController(); const epoch = privacyEpoch.current; metadataController.current = abort; queueMicrotask(() => { if (!abort.signal.aborted) setLoading(true); });
    conversationDetail(selected, abort.signal).then(result => {
      if (!abort.signal.aborted && epoch === privacyEpoch.current) {
        setDetail(result.conversation);
        setDenied(false);
        if (result.conversation.allowedActions.canSend) {
          void markConversationRead('STAFF', selected, csrfToken, abort.signal).catch(() => { if (!abort.signal.aborted && epoch === privacyEpoch.current) setError('Unable to update read status. Refresh the conversation to retry.'); });
        }
        if (!result.conversation.allowedActions.canView) copilotMemory.delete(selected);
      }
    }).catch(failure => {
      if (abort.signal.aborted || epoch !== privacyEpoch.current) return;
      if (failure instanceof ConversationError && [401, 403, 404].includes(failure.status)) onDenied(failure);
      else setError(failure instanceof ConversationError ? failure.message : 'Unable to load this conversation. Retry to continue.');
    }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [selected, revision, blocked, csrfToken, onDenied, copilotMemory]);
  useEffect(() => {
    if (!blocked) return;
    acceptController.current?.abort(); transcriptMemory.clear(); directoryMemory.clear(); composerMemory.clear(); copilotMemory.clear();
    let disposed = false;
    queueMicrotask(() => { if (!disposed) { setDetail(null); setAccepting(false); acceptLock.current = false; } });
    return () => { disposed = true; };
  }, [blocked, transcriptMemory, directoryMemory, composerMemory, copilotMemory]);
  useEffect(() => () => acceptController.current?.abort(), []);
  const runControlAction = async (mode: 'ACCEPT' | 'TAKEOVER') => {
    if (!detail || !selected || acceptLock.current || blocked) return;
    acceptLock.current = true; setAccepting(true); setError('');
    const id = selected;
    const command = intent.current ?? { clientRequestId: crypto.randomUUID(), expectedVersion: detail.controlVersion };
    intent.current = command;
    const abort = new AbortController(); acceptController.current = abort;
    const reconcile = mode === 'TAKEOVER' ? reconcileTakeover : reconcileAccept;
    const submit = mode === 'TAKEOVER' ? takeoverConversation : acceptConversation;
    const applySuccess = (conversation: Conversation) => {
      if (abort.signal.aborted || currentId.current !== id) return;
      setDetail(conversation);
      setUncertain(false);
      intent.current = null;
      setDirectoryRevision(value => value + 1);
      setLiveRevision(value => value + 1);
      if (conversation.allowedActions.canSend) {
        void markConversationRead('STAFF', id, csrfToken, abort.signal).catch(() => {});
      }
    };
    try {
      if (uncertain) {
        try {
          await reconcile(id, command, abort.signal);
          const result = await conversationDetail(id, abort.signal);
          applySuccess(result.conversation);
          return;
        } catch (failure) { if (!(failure instanceof ConversationError && failure.status === 404)) throw failure; }
      }
      const result = await submit(id, command, csrfToken, abort.signal);
      applySuccess(result.conversation);
    } catch (failure) {
      if (abort.signal.aborted || currentId.current !== id) return;
      if (failure instanceof ConversationError && [401, 403, 404].includes(failure.status)) onDenied(failure);
      else if (failure instanceof ConversationError && failure.status === 409) { intent.current = null; setUncertain(false); setError(failure.message); setRevision(value => value + 1); }
      else { setUncertain(true); setError(mode === 'TAKEOVER' ? 'Takeover could not be confirmed. Check the result before continuing.' : 'Acceptance could not be confirmed. Check the result before continuing.'); }
    } finally { if (!abort.signal.aborted && currentId.current === id) { acceptLock.current = false; setAccepting(false); } }
  };
  const visible = !blocked && !denied && detail?.id === selected ? detail : null;

  return <section aria-label="Staff inbox" className="tw:flex tw:min-h-0 tw:min-w-0 tw:flex-1 tw:h-full tw:overflow-hidden tw:bg-slate-50 tw:max-[1000px]:h-[75dvh] tw:max-[1000px]:flex-none">
    {/* Column 1: Conversations Directory */}
    <aside aria-label="Conversation directory" className={(collapsed ? 'tw:hidden' : selected ? 'tw:hidden tw:lg:flex' : 'tw:flex') + ' tw:min-h-0 tw:w-full tw:shrink-0 tw:flex-col tw:border-r tw:border-slate-200/80 tw:bg-white tw:lg:w-80'}>
      <header className="tw:shrink-0 tw:border-b tw:border-slate-100 tw:p-4">
        <div className="tw:mb-3 tw:flex tw:items-center tw:justify-between tw:gap-3 tw:h-8">
          <div className="tw:flex tw:items-center tw:gap-2">
            <h1 className="tw:text-base tw:font-bold tw:text-slate-900 tw:leading-none tw:m-0">Inbox</h1>
          </div>
          <div className="tw:flex tw:items-center tw:gap-2">
            <button className={inboxButton + ' tw:hidden! tw:lg:inline-flex! tw:h-7 tw:w-7! tw:p-0! tw:items-center tw:justify-center tw:rounded-lg! tw:border-slate-200! tw:shadow-2xs'} aria-label="Collapse conversation directory" title="Collapse conversation directory" aria-expanded={!collapsed} onClick={() => setCollapsed(true)}>
              <CollapseIcon open/>
            </button>
          </div>
        </div>
        
        {/* Filter Pills */}
        <nav aria-label="Conversation filters" className="tw:mb-3 tw:flex tw:gap-1.5 tw:p-1 tw:bg-slate-100 tw:rounded-xl">
          {(['all', 'requests', 'active'] as const).map(value => (
            <Link key={value} href={href(selected, value)} prefetch={false} aria-current={filter === value ? 'page' : undefined} className={'tw:flex-1 tw:text-center tw:rounded-lg tw:py-1.5 tw:text-xs tw:font-medium tw:transition-all tw:no-underline ' + (filter === value ? 'tw:bg-white tw:font-semibold tw:text-blue-700 tw:shadow-xs' : 'tw:text-slate-600 tw:hover:text-slate-900')}>
              {value === 'all' ? 'All' : value === 'requests' ? 'Requests' : 'Active'}
            </Link>
          ))}
        </nav>
        
        {/* Search */}
        <div className="tw:relative">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="tw:absolute tw:left-3 tw:top-1/2 tw:-translate-y-1/2 tw:text-slate-400 tw:pointer-events-none"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <label htmlFor="inbox-search" className="tw:sr-only">Search customers</label>
          <input ref={input} id="inbox-search" type="search" placeholder="Customer name or code" maxLength={100} value={draft} onChange={event => { searchEditing.current = true; setDraft(event.target.value); }} onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); applySearch(draft); } }} className="tw:w-full tw:pl-9 tw:pr-3 tw:py-2 tw:rounded-xl tw:border tw:border-slate-200 tw:bg-slate-50/50 tw:text-xs tw:text-slate-900 tw:placeholder:text-slate-400 tw:focus:bg-white tw:focus:outline-hidden tw:focus:border-blue-500 tw:focus:ring-2 tw:focus:ring-blue-100 tw:transition-all"/>
        </div>
      </header>
      {!blocked && !denied && <StaffInboxDirectory key={`${directoryKey}:${directoryEpoch}`} refreshToken={directoryRevision} filter={filter} search={applied} customerId={customerId} selected={selected} selectedCustomerId={visible?.customer.id} href={href} memory={directoryState.value} onDenied={onDenied}/>}
    </aside>

    {/* Column 2 & 3: Chat Workspace & Right Dossier */}
    <div className={(selected || collapsed ? 'tw:flex' : 'tw:hidden tw:lg:flex') + ' tw:min-h-0 tw:min-w-0 tw:flex-1 tw:flex-col tw:bg-white'}>
      {error && (
        <div role="alert" className="tw:shrink-0 tw:border-b tw:border-red-200 tw:bg-red-50/80 tw:px-6 tw:py-3 tw:text-xs tw:font-medium tw:text-red-800 tw:flex tw:items-center tw:justify-between">
          <span>{error}</span>
          <button className={inboxButton + ' tw:text-xs! tw:py-1! tw:px-2.5!'} onClick={() => { setDenied(false); setError(''); setDirectoryRevision(v => v + 1); setRevision(v => v + 1); }}>
            Retry inbox
          </button>
        </div>
      )}

      {blocked ? (
        <div role="alert" className="tw:p-8 tw:text-center tw:text-xs tw:text-slate-600">
          Session verification is required before viewing conversations.
        </div>
      ) : loading && !visible ? (
        <div role="status" className="tw:flex tw:flex-1 tw:items-center tw:justify-center tw:p-8 tw:text-xs tw:text-slate-500">
          Loading conversation…
        </div>
      ) : visible ? (
        <div ref={chatLayout} className="tw:relative tw:flex tw:min-h-0 tw:min-w-0 tw:flex-1 tw:overflow-hidden">
          {/* Main Chat Flow (Center) */}
          <div className="tw:flex tw:min-h-0 tw:min-w-0 tw:flex-1 tw:flex-col tw:border-r tw:border-slate-200/80 tw:bg-slate-50/30">
            {/* Top Customer Header Bar (Inside Center Column) */}
            <header className="tw:flex tw:h-16 tw:shrink-0 tw:items-center tw:justify-between tw:gap-4 tw:border-b tw:border-slate-200/80 tw:bg-white tw:px-6 tw:shadow-2xs">
              <div className="tw:flex tw:items-center tw:gap-3 tw:min-w-0">
                {collapsed && <button className={inboxButton + ' tw:p-1.5!'} aria-label="Expand conversation directory" title="Expand conversation directory" aria-expanded={false} onClick={() => setCollapsed(false)}><CollapseIcon open={false}/></button>}
                {selected && <Link href={href()} className="tw:text-xs tw:font-semibold tw:text-blue-600 tw:lg:hidden">Inbox list</Link>}
                
                <div className="tw:flex tw:items-center tw:gap-3 tw:min-w-0">
                  <div className="tw:grid tw:place-items-center tw:w-10 tw:h-10 tw:rounded-full tw:bg-gradient-to-tr tw:from-blue-600 tw:to-indigo-500 tw:text-white tw:font-bold tw:text-sm tw:shrink-0 tw:shadow-xs">
                    {visible.customer.fullName.slice(0, 1)}
                  </div>
                  <div className="tw:min-w-0 tw:flex tw:flex-col tw:justify-center">
                    <div className="tw:flex tw:items-center tw:gap-2">
                      <h2 className="tw:m-0 tw:truncate tw:text-base tw:font-bold tw:text-slate-900 tw:leading-tight">{visible.customer.fullName}</h2>
                      {visible.status === 'PENDING_HANDOFF' && (
                        <span className="tw:inline-flex tw:items-center tw:gap-1.5 tw:px-2 tw:py-0.5 tw:rounded-full tw:text-[11px] tw:font-semibold tw:bg-amber-50 tw:text-amber-700 tw:border tw:border-amber-200/60">
                          <span className="tw:w-1.5 tw:h-1.5 tw:rounded-full tw:bg-amber-500 tw:animate-pulse"/>
                          Support Requested
                        </span>
                      )}
                      {visible.status === 'AI_ACTIVE' && (
                        <span className="tw:inline-flex tw:items-center tw:gap-1.5 tw:px-2 tw:py-0.5 tw:rounded-full tw:text-[11px] tw:font-semibold tw:bg-purple-50 tw:text-purple-700 tw:border tw:border-purple-200/60">
                          <span className="tw:w-1.5 tw:h-1.5 tw:rounded-full tw:bg-purple-500"/>
                          AI Active
                        </span>
                      )}
                    </div>
                    <p className="tw:m-0 tw:truncate tw:text-xs tw:text-slate-500 tw:leading-tight tw:mt-0.5 tw:font-mono">
                      {visible.customer.accountCode}
                    </p>
                  </div>
                </div>
              </div>

              {visible.allowedActions.canView && <button type="button"
                className={inboxButton + ' tw:shrink-0 tw:lg:hidden'}
                aria-controls="staff-copilot" aria-expanded={copilotOpen}
                onClick={event => toggleCopilot(event.currentTarget)}>Copilot</button>}

              {/* Accept button when customer requested support */}
              {visible.allowedActions.canAccept && (
                <div className="tw:flex tw:items-center tw:gap-3 tw:shrink-0">
                  <button
                    type="button"
                    onClick={() => void runControlAction('ACCEPT')}
                    disabled={accepting || !csrfToken}
                    className="tw:inline-flex tw:items-center tw:gap-1.5 tw:rounded-full tw:bg-blue-600 tw:px-3.5 tw:py-1.5 tw:text-xs tw:font-bold tw:text-white tw:shadow-xs tw:hover:bg-blue-700 tw:disabled:opacity-50 tw:cursor-pointer tw:transition-all">
                    <span className="tw:w-2 tw:h-2 tw:rounded-full tw:bg-white tw:animate-pulse"/>
                    {accepting ? 'Accepting…' : uncertain ? 'Check acceptance result' : 'Accept request'}
                  </button>
                </div>
              )}

              {/* Proactive Takeover button when conversation is AI_ACTIVE */}
              {visible.allowedActions.canTakeover && (
                <div className="tw:flex tw:items-center tw:gap-3 tw:shrink-0">
                  <button
                    type="button"
                    onClick={() => void runControlAction('TAKEOVER')}
                    disabled={accepting || !csrfToken}
                    className="tw:inline-flex tw:items-center tw:gap-1.5 tw:rounded-full tw:bg-emerald-600 tw:px-3.5 tw:py-1.5 tw:text-xs tw:font-bold tw:text-white tw:shadow-xs tw:hover:bg-emerald-700 tw:disabled:opacity-50 tw:cursor-pointer tw:transition-all">
                    <span className="tw:w-2 tw:h-2 tw:rounded-full tw:bg-white tw:animate-pulse"/>
                    {accepting ? 'Taking over…' : uncertain ? 'Check takeover result' : '● Takeover'}
                  </button>
                </div>
              )}
            </header>

            {/* Support Request Context Banner (non-blocking; full transcript visible below) */}
            {visible.status === 'PENDING_HANDOFF' && visible.request && (
              <div className="tw:shrink-0 tw:border-b tw:border-amber-200/70 tw:bg-amber-50/70 tw:px-6 tw:py-3">
                <p className="tw:m-0 tw:text-xs tw:font-bold tw:text-amber-900">Customer requested staff support</p>
                {visible.request.sharedReason && (
                  <p className="tw:m-0 tw:mt-0.5 tw:text-xs tw:text-amber-800 tw:italic">&ldquo;{visible.request.sharedReason}&rdquo;</p>
                )}
              </div>
            )}

            {/* Full Customer-facing Transcript (viewable when canView is true) */}
            {visible.allowedActions.canView && (
              <ConversationTranscript key={visible.id} id={visible.id} memory={transcriptMemory} incoming={incoming} refreshToken={liveRevision} onDenied={onDenied}/>
            )}

            {/* Message Composer (only when canSend is true) or Read-Only Notice */}
            {visible.allowedActions.canView && visible.allowedActions.canSend ? (
              <ConversationComposer key={visible.id} id={visible.id} role="STAFF" version={visible.controlVersion} csrfToken={csrfToken} memory={composerMemory} onMessage={message => { setIncoming(message); setDirectoryRevision(v => v + 1); }} onDenied={onDenied} onStale={() => { setDetail(null); setRevision(v => v + 1); }}/>
            ) : visible.allowedActions.canView ? (
              <div role="status" className="tw:shrink-0 tw:border-t tw:border-slate-200/80 tw:bg-slate-50 tw:px-6 tw:py-3 tw:text-xs tw:text-slate-600">
                {visible.allowedActions.canTakeover
                  ? 'Viewing AI conversation (read-only). Click Takeover to take control and reply directly.'
                  : visible.allowedActions.canAccept
                  ? 'Reviewing customer support request (read-only). Accept the request to reply.'
                  : 'Viewing conversation (read-only).'}
              </div>
            ) : null}
          </div>

          {/* Sub-Rail Switcher (Slim vertical buttons) */}
          <div className="tw:hidden tw:lg:flex tw:w-12 tw:shrink-0 tw:border-r tw:border-slate-200/80 tw:bg-slate-50/80 tw:flex-col tw:items-center tw:py-3 tw:gap-2">
            <button 
              onClick={() => setRightPanelOpen(v => !v)}
              title={rightPanelOpen ? 'Collapse Details Panel' : 'Expand Details Panel'}
              className="tw:w-8 tw:h-8 tw:rounded-lg tw:grid tw:place-items-center tw:text-slate-400 tw:hover:text-slate-700 tw:hover:bg-slate-200/60 tw:transition-all tw:cursor-pointer">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/></svg>
            </button>

            <button 
              onClick={() => { setRightPanelTab('details'); setRightPanelOpen(true); }}
              title="Case Details"
              className={'tw:w-8 tw:h-8 tw:rounded-lg tw:grid tw:place-items-center tw:transition-all tw:cursor-pointer ' + (rightPanelOpen && rightPanelTab === 'details' ? 'tw:bg-blue-600 tw:text-white tw:shadow-2xs' : 'tw:text-slate-400 tw:hover:text-slate-700 tw:hover:bg-slate-200/60')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            </button>

            <button type="button"
              onClick={event => toggleCopilot(event.currentTarget)}
              disabled={!visible.allowedActions.canView}
              aria-controls={visible.allowedActions.canView ? 'staff-copilot' : undefined}
              aria-expanded={visible.allowedActions.canView && copilotOpen}
              aria-label="AI Copilot" title="AI Copilot"
              className={'tw:w-8 tw:h-8 tw:rounded-lg tw:grid tw:place-items-center tw:transition-all tw:cursor-pointer ' + (rightPanelOpen && rightPanelTab === 'agent' ? 'tw:bg-blue-600 tw:text-white tw:shadow-2xs' : 'tw:text-slate-400 tw:hover:text-slate-700 tw:hover:bg-slate-200/60')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            </button>

            <button 
              onClick={() => { setRightPanelTab('lookup'); setRightPanelOpen(true); }}
              title="Policy Lookup"
              className={'tw:w-8 tw:h-8 tw:rounded-lg tw:grid tw:place-items-center tw:transition-all tw:cursor-pointer ' + (rightPanelOpen && rightPanelTab === 'lookup' ? 'tw:bg-blue-600 tw:text-white tw:shadow-2xs' : 'tw:text-slate-400 tw:hover:text-slate-700 tw:hover:bg-slate-200/60')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </button>
          </div>

          {/* Right Panel: Case Details Dossier */}
          {rightPanelOpen && (!copilotOpen || !visible.allowedActions.canView) && (
            <aside aria-label="Case Details" className="tw:hidden tw:lg:flex tw:w-80 tw:shrink-0 tw:bg-slate-50/60 tw:border-r tw:border-slate-200/80 tw:flex-col tw:overflow-hidden">
              <header className="tw:h-16 tw:px-5 tw:border-b tw:border-slate-200/80 tw:bg-white tw:flex tw:items-center tw:justify-between tw:shrink-0">
                <h3 className="tw:text-sm tw:font-bold tw:text-slate-900">
                  {rightPanelTab === 'lookup' ? 'Policy Lookup' : 'Case Details'}
                </h3>
                <span className="tw:text-[11px] tw:font-mono tw:text-slate-400">{visible.id.slice(0, 8)}</span>
              </header>

              <div className="tw:flex-1 tw:overflow-y-auto tw:p-4 tw:space-y-4">
                {(rightPanelTab === 'details' || copilotOpen) && (
                  <>
                    {/* 1. CASE OVERVIEW */}
                    <div className="tw:rounded-2xl tw:bg-white tw:border tw:border-slate-200/80 tw:p-4 tw:shadow-2xs">
                      <span className="tw:text-[10px] tw:font-bold tw:uppercase tw:tracking-wider tw:text-slate-400 tw:block tw:mb-3">CASE OVERVIEW</span>
                      <dl className="tw:space-y-2.5 tw:text-xs">
                        <div className="tw:flex tw:justify-between tw:items-center">
                          <dt className="tw:text-slate-500">Status</dt>
                          <dd>
                            {visible.status === 'STAFF_ACTIVE' ? (
                              <span className="tw:font-semibold tw:text-blue-700">Staff Active</span>
                            ) : visible.status === 'AI_ACTIVE' ? (
                              <span className="tw:font-semibold tw:text-purple-700">AI Active</span>
                            ) : (
                              <span className="tw:font-semibold tw:text-amber-600">Support requested</span>
                            )}
                          </dd>
                        </div>
                        <div className="tw:flex tw:justify-between tw:items-center">
                          <dt className="tw:text-slate-500">Session ID</dt>
                          <dd className="tw:font-mono tw:font-semibold tw:text-slate-800 tw:truncate tw:max-w-[150px]">{visible.id}</dd>
                        </div>
                        <div className="tw:flex tw:justify-between tw:items-center">
                          <dt className="tw:text-slate-500">Channel</dt>
                          <dd className="tw:font-medium tw:text-slate-800">{visible.entryType}</dd>
                        </div>
                        <div className="tw:flex tw:justify-between tw:items-center">
                          <dt className="tw:text-slate-500">Last updated</dt>
                          <dd className="tw:text-slate-600">{formatTime(visible.activityAt)}</dd>
                        </div>
                      </dl>
                      {visible.request && (
                        <div className="tw:mt-3 tw:pt-3 tw:border-t tw:border-slate-100 tw:text-xs">
                          <span className="tw:text-[11px] tw:font-semibold tw:text-amber-800 tw:block tw:mb-1">Customer support request</span>
                          <p className="tw:text-slate-600 tw:leading-relaxed">
                            {visible.request.sharedReason || 'Customer requested direct staff assistance.'}
                          </p>
                          <span className="tw:text-[10px] tw:text-slate-400 tw:mt-1 tw:block">
                            Sent at {formatTime(visible.request.requestedAt)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* 2. CUSTOMER PROFILE */}
                    <div className="tw:rounded-2xl tw:bg-white tw:border tw:border-slate-200/80 tw:p-4 tw:shadow-2xs">
                      <span className="tw:text-[10px] tw:font-bold tw:uppercase tw:tracking-wider tw:text-slate-400 tw:block tw:mb-3">CUSTOMER PROFILE</span>
                      <dl className="tw:space-y-2.5 tw:text-xs">
                        <div className="tw:flex tw:justify-between">
                          <dt className="tw:text-slate-500">Full name</dt>
                          <dd className="tw:font-bold tw:text-slate-900">{visible.customer.fullName}</dd>
                        </div>
                        <div className="tw:flex tw:justify-between">
                          <dt className="tw:text-slate-500">Customer ID</dt>
                          <dd className="tw:font-mono tw:font-semibold tw:text-slate-800">{visible.customer.accountCode}</dd>
                        </div>
                      </dl>
                      <Link href={`/staff/customers?search=${encodeURIComponent(visible.customer.accountCode)}`} className="tw:mt-3 tw:block tw:text-center tw:rounded-xl tw:border tw:border-slate-200 tw:bg-slate-50 tw:py-2 tw:text-xs tw:font-semibold tw:text-blue-600 tw:hover:bg-blue-50 tw:transition-colors tw:no-underline">
                        View customer profile →
                      </Link>
                    </div>

                    {/* 3. POLICY & TICKET LINKAGE (Clean empty states reflecting true system state) */}
                    <div className="tw:rounded-2xl tw:bg-white tw:border tw:border-slate-200/80 tw:p-4 tw:shadow-2xs">
                      <span className="tw:text-[10px] tw:font-bold tw:uppercase tw:tracking-wider tw:text-slate-400 tw:block tw:mb-2">LINKED POLICY</span>
                      <p className="tw:text-xs tw:text-slate-500 tw:leading-relaxed tw:mb-3">
                        No insurance policy or ticket pinned for this session.
                      </p>
                      <button
                        type="button"
                        onClick={() => { setRightPanelTab('lookup'); setRightPanelOpen(true); }}
                        className="tw:block tw:w-full tw:text-center tw:rounded-xl tw:border tw:border-slate-200 tw:bg-slate-50 tw:py-2 tw:text-xs tw:font-semibold tw:text-blue-600 tw:hover:bg-blue-50 tw:transition-colors tw:no-underline tw:cursor-pointer"
                      >
                        Open Policy Lookup →
                      </button>
                    </div>
                  </>
                )}

                {rightPanelTab === 'lookup' && (
                  <StaffInboxPolicyLookup
                    customerId={visible.customer.id}
                    customerName={visible.customer.fullName}
                  />
                )}
              </div>
            </aside>
          )}
          {visible.allowedActions.canView && <aside id="staff-copilot" aria-label="AI Copilot"
            hidden={!copilotOpen}
            onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); closeCopilot(); } }}
            className={(copilotOpen ? 'tw:flex ' : 'tw:hidden ') + copilotWidths[copilotWidth] + ' tw:relative tw:z-20 tw:min-h-0 tw:flex-col tw:overflow-hidden tw:border-l tw:border-slate-200 tw:bg-slate-50 tw:max-lg:absolute tw:max-lg:inset-x-0 tw:max-lg:bottom-0 tw:max-lg:top-16 tw:lg:shrink-0'}>
            <div role="separator" tabIndex={0} aria-label="Resize Copilot panel" aria-orientation="vertical"
              aria-valuemin={25} aria-valuemax={50} aria-valuenow={25 + copilotWidth * 5}
              className="tw:absolute tw:inset-y-0 tw:left-0 tw:z-10 tw:hidden tw:w-2 tw:cursor-col-resize tw:touch-none tw:hover:bg-blue-300/60 tw:focus-visible:bg-blue-400 tw:lg:grid tw:place-items-center"
              onPointerDown={event => { if (event.button === 0) event.currentTarget.setPointerCapture(event.pointerId); }}
              onPointerMove={event => {
                if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
                const bounds = chatLayout.current?.getBoundingClientRect();
                if (bounds?.width) resizeCopilot(Math.round(((bounds.right - event.clientX) / bounds.width * 100 - 25) / 5));
              }}
              onKeyDown={event => {
                const steps: Partial<Record<string, number>> = {
                  ArrowLeft: copilotWidth + 1, ArrowRight: copilotWidth - 1, Home: 0, End: copilotWidths.length - 1,
                };
                const step = steps[event.key];
                if (step === undefined) return;
                event.preventDefault();
                resizeCopilot(step);
              }}><span aria-hidden="true" className="tw:h-8 tw:w-0.5 tw:rounded-full tw:bg-slate-400" /></div>
            <header className="tw:flex tw:min-h-16 tw:shrink-0 tw:items-center tw:justify-between tw:gap-3 tw:border-b tw:border-slate-200 tw:bg-white tw:px-4">
              <div className="tw:min-w-0">
                <h3 className="tw:text-sm tw:font-bold tw:text-slate-900">AI Copilot</h3>
                <p className="tw:truncate tw:text-xs tw:text-slate-600">{visible.customer.fullName}</p>
              </div>
            </header>
            <StaffCopilotPanel key={visible.id} id={visible.id} csrfToken={csrfToken} open={copilotOpen}
              memory={copilotMemory} onSessionExpired={onCopilotSessionExpired} />
          </aside>}
        </div>
      ) : !selected && (
        <div className="tw:relative tw:flex tw:flex-1 tw:flex-col tw:items-center tw:justify-center tw:p-8 tw:text-center tw:bg-slate-50/50">
          {collapsed && (
            <div className="tw:absolute tw:top-4 tw:left-4">
              <button className={inboxButton + ' tw:p-1.5!'} aria-label="Expand conversation directory" title="Expand conversation directory" aria-expanded={false} onClick={() => setCollapsed(false)}>
                <CollapseIcon open={false}/>
              </button>
            </div>
          )}
          <div className="tw:w-16 tw:h-16 tw:rounded-3xl tw:bg-blue-50 tw:border tw:border-blue-200/60 tw:text-blue-600 tw:grid tw:place-items-center tw:mb-4 tw:shadow-xs">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </div>
          <h3 className="tw:text-base tw:font-bold tw:text-slate-900">Select a conversation</h3>
          <p className="tw:mt-1 tw:max-w-sm tw:text-xs tw:leading-relaxed tw:text-slate-500">
            Choose a customer from the directory on the left to inspect transcripts, accept handoffs, or reply directly.
          </p>
        </div>
      )}
    </div>
  </section>;
}
