'use client';
import Link from 'next/link';
import { useChatRefresh } from '@/lib/chat-realtime';
import { realtimeEvent } from '@/lib/realtime';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ConversationError, customerConversation, customerConversations, type ChatMessage, type CursorPage, type CustomerConversation } from '@/lib/conversation-api';
import { ConversationTranscript, inboxButton, type TranscriptSnapshot } from './conversation-transcript';
import { ConversationComposer, type ComposerSnapshot } from './conversation-composer';
import { CustomerHandoffDialog } from './customer-handoff-dialog';
export function CustomerConversations({ csrfToken, blocked }: { csrfToken: string; blocked: boolean }) {
  const query = useSearchParams(); const router = useRouter();
  const selected = query.get('conversationId');
  const privacyEpoch = useRef(0);
  const metadataController = useRef<AbortController | null>(null);
  const listController = useRef<AbortController | null>(null);
  const [list, setList] = useState<CursorPage<CustomerConversation> | null>(null);
  const [detail, setDetail] = useState<CustomerConversation | null>(null);
  const [revision, setRevision] = useState(0);
  const [cursor, setCursor] = useState<string>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [dialog, setDialog] = useState<'AI' | 'DIRECT' | 'HANDOFF' | null>(null);
  const [liveRevision, setLiveRevision] = useState(0);
  const [incoming, setIncoming] = useState<ChatMessage | null>(null);
  const [transcriptMemory] = useState(() => new Map<string, TranscriptSnapshot>());
  const [composerMemory] = useState(() => new Map<string, ComposerSnapshot>());
  const onDenied = useCallback((failure: ConversationError) => {
    privacyEpoch.current++; metadataController.current?.abort(); listController.current?.abort();
    transcriptMemory.clear(); composerMemory.clear(); setDetail(null); setList(null); setDenied(true); setError(failure.message);
    if (failure.status === 401) router.replace('/login');
  }, [router, transcriptMemory, composerMemory]);
  useEffect(() => {
    const abort = new AbortController(); const epoch = privacyEpoch.current; listController.current = abort;
    if (blocked) { transcriptMemory.clear(); composerMemory.clear(); return; }
    queueMicrotask(() => { if (!abort.signal.aborted && epoch === privacyEpoch.current) { setLoading(true); setError(''); } });
    customerConversations(cursor, abort.signal).then(data => { if (!abort.signal.aborted && epoch === privacyEpoch.current) { setList(current => ({ ...data, items: cursor ? [...new Map([...(current?.items ?? []), ...data.items].map(row => [row.id, row])).values()] : data.items })); setDenied(false); } }).catch(failure => { if (!abort.signal.aborted && epoch === privacyEpoch.current) { if (failure instanceof ConversationError && [401, 403, 404].includes(failure.status)) onDenied(failure); else setError('Unable to load conversations. Retry.'); } }).finally(() => { if (!abort.signal.aborted && epoch === privacyEpoch.current) setLoading(false); });
    return () => abort.abort();
  }, [cursor, revision, blocked, onDenied, transcriptMemory, composerMemory]);
  useEffect(() => {
    const abort = new AbortController(); const epoch = privacyEpoch.current; metadataController.current = abort;
    queueMicrotask(() => { if (!abort.signal.aborted && epoch === privacyEpoch.current) { setDetail(null); setIncoming(null); } });
    if (!selected || blocked) return () => abort.abort();
    customerConversation(selected, abort.signal).then(data => { if (!abort.signal.aborted && epoch === privacyEpoch.current) { setDetail(data.conversation); setDenied(false); } }).catch(failure => { if (!abort.signal.aborted && epoch === privacyEpoch.current) { if (failure instanceof ConversationError && [401, 403, 404].includes(failure.status)) onDenied(failure); else setError('Unable to load conversation. Retry.'); } });
    return () => abort.abort();
  }, [selected, revision, blocked, onDenied]);
  useEffect(() => {
    const refresh = (event: Event) => {
      const type = (event as CustomEvent<{ type: string }>).detail?.type;
      if (type === 'invalidate' || type === 'session-expired') { privacyEpoch.current++; metadataController.current?.abort(); listController.current?.abort(); transcriptMemory.clear(); composerMemory.clear(); setDetail(null); setList(null); setRevision(value => value + 1); }
    };
    window.addEventListener(realtimeEvent, refresh); return () => window.removeEventListener(realtimeEvent, refresh);
  }, [transcriptMemory, composerMemory]);
  const clearLiveScope = useCallback(() => { privacyEpoch.current++; metadataController.current?.abort(); listController.current?.abort(); transcriptMemory.clear(); composerMemory.clear(); setDetail(null); setList(null); setIncoming(null); setLoading(false); }, [transcriptMemory, composerMemory]);
  const refreshLive = useCallback(async (signal: AbortSignal) => {
    const epoch = privacyEpoch.current;
    try {
      if (selected) { const current = await customerConversation(selected, signal); if (!signal.aborted && epoch === privacyEpoch.current) { setDetail(current.conversation); setDenied(false); setLiveRevision(value => value + 1); } }
      const data = await customerConversations(undefined, signal);
      if (!signal.aborted && epoch === privacyEpoch.current) { setLoading(false); setList(current => ({ ...data, items: [...new Map([...data.items, ...(current?.items ?? []).filter(row => !data.items.some(fresh => fresh.id === row.id))].map(row => [row.id, row])).values()], pageInfo: current && current.items.length > data.items.length ? current.pageInfo : data.pageInfo })); }
    } catch (failure) {
      if (signal.aborted || epoch !== privacyEpoch.current) return;
      if (failure instanceof ConversationError && [401, 403, 404].includes(failure.status)) onDenied(failure);
      else setError('Live updates could not be loaded. Use Refresh to retry.');
    }
  }, [selected, onDenied]);
  useChatRefresh(refreshLive, clearLiveScope, !blocked);
  const href = (id?: string) => { const values = new URLSearchParams(query.toString()); if (id) values.set('conversationId', id); else values.delete('conversationId'); return `/customer${values.size ? `?${values}` : ''}`; };
  const visible = !blocked && !denied && detail?.id === selected ? detail : null;
  return <section aria-label="Customer conversations" className="tw:mt-6 tw:overflow-hidden tw:rounded-xl tw:border tw:border-slate-200 tw:bg-white tw:text-slate-900">
    <header className="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3 tw:border-b tw:border-slate-200 tw:p-4"><h2 className="tw:text-lg! tw:font-semibold">Conversations</h2><div className="tw:flex tw:flex-wrap tw:gap-2"><button className={inboxButton} onClick={() => setDialog('AI')} disabled={blocked || denied}>New AI chat</button><button className={inboxButton} onClick={() => setDialog('DIRECT')} disabled={blocked || denied}>Message Staff</button><button className={inboxButton} disabled={blocked} onClick={() => { setDenied(false); setRevision(value => value + 1); }}>Refresh conversations</button></div></header>
    {error && <p role="alert" className="tw:bg-red-50 tw:p-4 tw:text-sm tw:text-red-800">{error}</p>}
    <div className="tw:flex tw:h-[680px] tw:max-h-[80dvh] tw:min-h-0">
      <aside aria-label="Your conversation list" className={(selected ? 'tw:hidden tw:md:block' : 'tw:block') + ' tw:w-full tw:shrink-0 tw:overflow-y-auto tw:border-r tw:border-slate-200 tw:md:w-60'}>
        {!blocked && !denied && list?.items.map(row => <Link key={row.id} href={href(row.id)} prefetch={false} aria-current={selected === row.id ? 'page' : undefined} className={'tw:block tw:border-b tw:border-slate-100 tw:p-4 tw:text-sm tw:no-underline ' + (selected === row.id ? 'tw:bg-blue-50' : 'tw:hover:bg-slate-50')}><span className="tw:block tw:break-words tw:font-medium tw:text-slate-900">{row.subject}</span><span className="tw:mt-2 tw:block tw:text-xs tw:text-slate-600">{row.status === 'AI_ACTIVE' ? 'AI conversation' : row.status === 'PENDING_HANDOFF' ? 'Awaiting staff' : 'Staff active'}</span>{row.activityAt && <time className="tw:mt-1 tw:block tw:text-xs tw:text-slate-500" dateTime={row.activityAt}>{new Date(row.activityAt).toLocaleString()}</time>}</Link>)}
        {loading && <p role="status" className="tw:p-4 tw:text-sm">Loading conversations…</p>}{!loading && !list?.items.length && <p className="tw:p-4 tw:text-sm tw:text-slate-600">No conversations yet.</p>}
        {list?.pageInfo.hasMore && <button className={inboxButton + ' tw:m-3!'} disabled={loading} onClick={() => setCursor(list.pageInfo.nextCursor ?? undefined)}>Load more conversations</button>}
      </aside>
      <div className={(selected ? 'tw:flex' : 'tw:hidden tw:md:flex') + ' tw:min-h-0 tw:min-w-0 tw:flex-1 tw:flex-col'}>
        {selected && <Link href={href()} className="tw:p-3 tw:text-sm tw:text-blue-700 tw:md:hidden">Conversation list</Link>}
        {visible ? <><header className="tw:shrink-0 tw:border-b tw:border-slate-200 tw:p-4"><h3 className="tw:break-words tw:text-sm tw:font-semibold">{visible.subject}</h3><p className="tw:mt-2 tw:text-xs tw:leading-5 tw:text-slate-600">{visible.entryType === 'DIRECT' && !visible.allowedActions.send ? 'Staff routing changed. Start a new Direct conversation or request support to share this history.' : visible.status === 'AI_ACTIVE' ? 'AI replies are not available yet. Your messages are saved privately.' : visible.status === 'PENDING_HANDOFF' ? 'Awaiting Staff acceptance. You can continue writing here.' : `Staff support${visible.staff ? ` · ${visible.staff.fullName}` : ''}`}</p>{visible.allowedActions.requestStaff && <button className={inboxButton + ' tw:mt-3!'} onClick={() => setDialog('HANDOFF')}>Request Staff support</button>}</header>
          {visible.allowedActions.readMessages ? <ConversationTranscript key={visible.id} id={visible.id} role="CUSTOMER" memory={transcriptMemory} incoming={incoming} refreshToken={liveRevision} onDenied={onDenied}/> : <p className="tw:p-4 tw:text-sm">This legacy conversation requires review before it can be used.</p>}
          {visible.allowedActions.send && <ConversationComposer key={visible.id} id={visible.id} role="CUSTOMER" version={visible.controlVersion} csrfToken={csrfToken} memory={composerMemory} onMessage={setIncoming} onDenied={onDenied} onStale={() => setRevision(value => value + 1)}/>}
        </> : <p className="tw:p-6 tw:text-sm tw:text-slate-600">{blocked ? 'Session verification required.' : selected ? 'Select Refresh conversations to retry loading this conversation.' : 'Choose a conversation or start a new one.'}</p>}
      </div>
    </div>
    {dialog && !blocked && !denied && <CustomerHandoffDialog mode={dialog} conversationId={selected ?? undefined} version={visible?.controlVersion} subject={dialog === 'HANDOFF' ? visible?.subject : undefined} csrfToken={csrfToken} onClose={() => setDialog(null)} onDenied={onDenied} onComplete={id => { setDialog(null); setRevision(value => value + 1); window.history.pushState(null, '', href(id)); }}/>}
  </section>;
}
