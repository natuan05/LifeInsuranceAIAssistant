'use client';
import Link from 'next/link';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ConversationError, inboxConversations, inboxCustomers, type ConversationRow, type CursorPage, type InboxCustomer, type InboxFilter } from '@/lib/conversation-api';
import { inboxButton } from './conversation-transcript';

export type DirectorySnapshot = { open: Set<string>; position: Map<string, number> };
function CustomerGroup({ customer, filter, selected, href, expand, memory, onDenied, refreshToken }: { customer: InboxCustomer; filter: InboxFilter; selected?: string; href: (id: string) => string; expand: boolean; refreshToken: number; memory: DirectorySnapshot; onDenied: (error: ConversationError) => void }) {
  const [open, setOpen] = useState(expand || memory.open.has(customer.id));
  const [result, setResult] = useState<CursorPage<ConversationRow> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [cursor, setCursor] = useState<string>();
  const loaded = useRef({ cursor: undefined as string | undefined, pages: 0 });
  useEffect(() => { let disposed = false; queueMicrotask(() => { if (expand && !disposed) { memory.open.add(customer.id); setOpen(true); } }); return () => { disposed = true; }; }, [expand, customer.id, memory]);
  useEffect(() => {
    if (!open) return;
    const abort = new AbortController(); queueMicrotask(() => { if (!abort.signal.aborted) { setLoading(true); setError(''); } });
    (async () => {
      const more = cursor !== loaded.current.cursor && Boolean(cursor);
      if (more) return { data: await inboxConversations(customer.id, filter, cursor, abort.signal), more, pages: loaded.current.pages + 1 };
      let next: string | undefined; let pages = 0;
      const items = new Map<string, ConversationRow>();
      let data: CursorPage<ConversationRow>;
      do {
        data = await inboxConversations(customer.id, filter, next, abort.signal);
        data.items.forEach(item => items.set(item.id, item)); pages++;
        next = data.pageInfo.nextCursor ?? undefined;
      } while (next && pages < Math.max(1, loaded.current.pages));
      return { data: { ...data, items: [...items.values()] }, more: false, pages };
    })().then(({ data, more, pages }) => {
      if (!abort.signal.aborted) { loaded.current = { cursor, pages }; setResult(current => ({ ...data, items: more ? [...new Map([...(current?.items ?? []), ...data.items].map(item => [item.id, item])).values()] : data.items })); }
    }).catch(failure => { if (!abort.signal.aborted) { if (failure instanceof ConversationError && [401, 403, 404].includes(failure.status)) onDenied(failure); setError(failure instanceof ConversationError ? failure.message : 'Unable to load conversations.'); } }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [customer.id, filter, open, cursor, revision, onDenied, refreshToken]);
  return <section className="tw:border-b tw:border-slate-100">
    <button aria-expanded={open} aria-controls={`inbox-customer-${customer.id}`} className="tw:flex tw:w-full! tw:items-center tw:justify-between! tw:gap-3! tw:px-4! tw:py-3.5! tw:text-left tw:hover:bg-slate-50 tw:transition-colors tw:cursor-pointer" onClick={() => { if (open) memory.open.delete(customer.id); else memory.open.add(customer.id); setOpen(value => !value); }}>
      <div className="tw:flex tw:items-center tw:gap-2.5 tw:min-w-0">
        <div className="tw:w-7 tw:h-7 tw:rounded-full tw:bg-blue-100 tw:text-blue-700 tw:text-xs tw:font-bold tw:grid tw:place-items-center tw:shrink-0">
          {customer.fullName.slice(0, 1)}
        </div>
        <span className="tw:min-w-0">
          <span className="tw:block tw:truncate tw:text-xs tw:font-bold tw:text-slate-900">{customer.fullName}</span>
          <span className="tw:block tw:text-[11px] tw:font-mono tw:text-slate-500">{customer.accountCode}</span>
        </span>
      </div>
      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`tw:text-slate-400 tw:transition-transform ${open ? 'tw:rotate-180' : ''}`}><path d="m6 9 6 6 6-6"/></svg>
    </button>
    {open && <div id={`inbox-customer-${customer.id}`} className="tw:bg-slate-50/50">
      {result?.items.map(row => (
        <Link key={row.id} href={href(row.id)} prefetch={false} aria-current={selected === row.id ? 'page' : undefined} className={'tw:block tw:border-t tw:border-slate-100 tw:px-4 tw:py-3 tw:no-underline tw:transition-colors ' + (selected === row.id ? 'tw:bg-blue-50/90 tw:border-l-4 tw:border-l-blue-600' : 'tw:hover:bg-blue-50/40')}>
          <div className="tw:flex tw:items-center tw:justify-between tw:gap-2">
            <span className="tw:block tw:truncate tw:text-xs tw:font-semibold tw:text-slate-900">{row.subject || 'Conversation'}</span>
            <span className={`tw:shrink-0 tw:rounded-full tw:px-2 tw:py-0.5 tw:text-[10px] tw:font-semibold ${row.status === 'PENDING_HANDOFF' ? 'tw:bg-amber-100 tw:text-amber-800' : 'tw:bg-emerald-100 tw:text-emerald-800'}`}>
              {row.status === 'PENDING_HANDOFF' ? 'Request' : 'Active'}
            </span>
          </div>
          <div className="tw:mt-1.5 tw:flex tw:items-center tw:justify-between tw:text-[11px] tw:text-slate-500">
            <span>{row.entryType === 'DIRECT' ? 'Direct message' : 'Transferred'}</span>
            <time dateTime={row.activityAt}>{new Date(row.activityAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}</time>
          </div>
        </Link>
      ))}
      {loading && !result && <p role="status" className="tw:px-4 tw:py-3 tw:text-xs tw:text-slate-500">Loading conversations…</p>}
      {error && <div role="alert" className="tw:p-4 tw:text-xs tw:text-red-700">{error}<button className={inboxButton + ' tw:mt-2! tw:text-xs!'} onClick={() => setRevision(value => value + 1)}>Retry</button></div>}
      {!loading && !error && result?.items.length === 0 && <p className="tw:p-4 tw:text-xs tw:text-slate-500">No conversations in this section.</p>}
      {result?.pageInfo.hasMore && <button className={inboxButton + ' tw:m-3! tw:text-xs!'} disabled={loading} onClick={() => setCursor(result.pageInfo.nextCursor ?? undefined)}>Load more conversations</button>}
    </div>}
  </section>;
}
export function StaffInboxDirectory({ filter, search, customerId, selected, selectedCustomerId, href, memory, onDenied, refreshToken }: { filter: InboxFilter; search: string; customerId?: string; selected?: string; selectedCustomerId?: string; href: (id: string) => string; memory: DirectorySnapshot; refreshToken: number; onDenied: (error: ConversationError) => void }) {
  const [result, setResult] = useState<CursorPage<{ customer: InboxCustomer; lastActivityAt: string }> | null>(null);
  const [cursor, setCursor] = useState<string>();
  const loaded = useRef({ cursor: undefined as string | undefined, pages: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const scroll = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { const element = scroll.current; if (element) element.scrollTop = memory.position.get('top') ?? 0; }, [memory, result]);
  useEffect(() => {
    const abort = new AbortController(); queueMicrotask(() => { if (!abort.signal.aborted) { setLoading(true); setError(''); } });
    (async () => {
      const more = cursor !== loaded.current.cursor && Boolean(cursor);
      if (more) return { data: await inboxCustomers(filter, search, customerId, cursor, abort.signal), more, pages: loaded.current.pages + 1 };
      let next: string | undefined; let pages = 0;
      const items = new Map<string, { customer: InboxCustomer; lastActivityAt: string }>();
      let data: CursorPage<{ customer: InboxCustomer; lastActivityAt: string }>;
      do {
        data = await inboxCustomers(filter, search, customerId, next, abort.signal);
        data.items.forEach(item => items.set(item.customer.id, item)); pages++;
        next = data.pageInfo.nextCursor ?? undefined;
      } while (next && pages < Math.max(1, loaded.current.pages));
      return { data: { ...data, items: [...items.values()] }, more: false, pages };
    })().then(({ data, more, pages }) => {
      if (!abort.signal.aborted) { loaded.current = { cursor, pages }; setResult(current => ({ ...data, items: more ? [...new Map([...(current?.items ?? []), ...data.items].map(item => [item.customer.id, item])).values()] : data.items })); }
    }).catch(failure => { if (!abort.signal.aborted) { if (failure instanceof ConversationError && [401, 403, 404].includes(failure.status)) onDenied(failure); setError(failure instanceof ConversationError ? failure.message : 'Unable to load customers.'); } }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [filter, search, customerId, cursor, revision, onDenied, refreshToken]);
  return <div ref={scroll} onScroll={event => { memory.position.set('top', event.currentTarget.scrollTop); }} className="tw:min-h-0 tw:flex-1 tw:overflow-y-auto tw:overscroll-contain" aria-label="Inbox customers">
    {result?.items.map(({ customer }) => <CustomerGroup key={customer.id} customer={customer} filter={filter} selected={selected} href={href} expand={selectedCustomerId === customer.id} memory={memory} onDenied={onDenied} refreshToken={refreshToken}/>)}
    {loading && !result && <p role="status" className="tw:p-4 tw:text-xs tw:text-slate-500">Loading customers…</p>}
    {error && <div role="alert" className="tw:p-4 tw:text-xs tw:text-red-700">{error}<button className={inboxButton + ' tw:mt-2! tw:text-xs!'} onClick={() => setRevision(value => value + 1)}>Retry</button></div>}
    {!loading && !error && result?.items.length === 0 && <p className="tw:p-5 tw:text-xs tw:leading-relaxed tw:text-slate-500">No matching conversations. Direct messages and transferred customer cases appear here.</p>}
    {result?.pageInfo.hasMore && <button className={inboxButton + ' tw:m-4! tw:text-xs!'} disabled={loading} onClick={() => setCursor(result.pageInfo.nextCursor ?? undefined)}>Load more customers</button>}
  </div>;
}
