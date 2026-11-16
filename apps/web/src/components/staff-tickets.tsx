'use client';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ticketEvent } from '@/lib/realtime';
import { AuthError } from '@/lib/auth-api';
import { updateTicketStatus, listTickets, readTicket, ticketStatuses, type Ticket, type TicketList, type TicketStatus } from '@/lib/ticket-api';
import { useAuthorizedRead, useCooldown } from './use-authorized-read';

const button = 'tw:inline-flex tw:items-center tw:rounded-xl tw:border tw:border-slate-200 tw:bg-white tw:px-3.5 tw:py-2 tw:text-xs tw:font-semibold tw:text-slate-700 tw:shadow-2xs tw:hover:bg-slate-50 tw:focus-visible:outline-2 tw:focus-visible:outline-blue-600 tw:disabled:opacity-40 tw:disabled:cursor-not-allowed tw:transition-colors tw:cursor-pointer';
const input = 'tw:w-full tw:min-w-0 tw:rounded-xl tw:border tw:border-slate-200 tw:bg-white tw:px-3.5 tw:py-2 tw:text-xs tw:text-slate-900 tw:focus:outline-hidden tw:focus:border-blue-500 tw:focus:ring-2 tw:focus:ring-blue-100 tw:transition-all';

const labels = { 
  OPEN: 'Open', 
  ASSIGNED: 'Assigned', 
  IN_PROGRESS: 'In progress', 
  RESOLVED: 'Resolved', 
  CLOSED: 'Closed' 
};

function Status({ value }: { value: Ticket['status'] }) {
  const styles: Record<Ticket['status'], string> = {
    IN_PROGRESS: 'tw:bg-emerald-50 tw:text-emerald-700 tw:border-emerald-200/60',
    ASSIGNED: 'tw:bg-blue-50 tw:text-blue-700 tw:border-blue-200/60',
    OPEN: 'tw:bg-amber-50 tw:text-amber-700 tw:border-amber-200/60',
    RESOLVED: 'tw:bg-purple-50 tw:text-purple-700 tw:border-purple-200/60',
    CLOSED: 'tw:bg-slate-100 tw:text-slate-600 tw:border-slate-200/60',
  };

  return (
    <span className={`tw:inline-flex tw:items-center tw:px-2.5 tw:py-0.5 tw:rounded-full tw:text-[11px] tw:font-semibold tw:border ${styles[value]}`}>
      {labels[value]}
    </span>
  );
}

function Notice({ state }: { state: { loading: boolean; error?: string; retry: () => void; retryDisabled: boolean } }) {
  if (state.loading) {
    return (
      <div role="status" className="tw:py-12 tw:text-center tw:text-xs tw:text-slate-500">
        <div className="tw:inline-block tw:w-4 tw:h-4 tw:border-2 tw:border-blue-600 tw:border-t-transparent tw:rounded-full tw:animate-spin tw:mb-2"/>
        <p>Loading tickets...</p>
      </div>
    );
  }
  if (state.error) {
    return (
      <div role="alert" className="tw:rounded-2xl tw:border tw:border-red-200 tw:bg-red-50/80 tw:p-4 tw:text-xs tw:text-red-800 tw:flex tw:items-center tw:justify-between tw:mb-6">
        <p className="tw:font-medium">{state.error}</p>
        <button className={button} disabled={state.retryDisabled} onClick={state.retry}>
          Try again
        </button>
      </div>
    );
  }
  return null;
}

function TicketDetail({ id, csrfToken, blocked, onAccepted, back }: { id: string; csrfToken: string; blocked: boolean; onAccepted: () => void; back: string }) {
  const state = useAuthorizedRead(id, signal => readTicket(id, signal), true, { eventName: ticketEvent });
  const [override, setOverride] = useState<{ base: typeof state.data; value: Ticket }>();
  const [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [unknown, setUnknown] = useState(false), [retryAt, setRetryAt] = useState<number>();
  const cooling = useCooldown(retryAt), operation = useRef<AbortController | null>(null), locked = useRef(false);
  useEffect(() => () => operation.current?.abort(), []);
  const ticket = state.data ? override && override.value.version >= state.data.ticket.version ? override.value : state.data.ticket : undefined;

  async function reconcile(signal: AbortSignal) {
    const result = await readTicket(id, signal); signal.throwIfAborted();
    setOverride({ base: state.data, value: result.ticket }); setUnknown(false);
    setMessage('Current status: ' + labels[result.ticket.status] + '. Review it before making another change.'); onAccepted();
  }

  async function submit(check = false, target?: TicketStatus) {
    if (!ticket || locked.current || blocked || cooling) return;
    locked.current = true; setBusy(true); setMessage('');
    const controller = new AbortController(); operation.current = controller;
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]);
    try {
      if (check) await reconcile(signal);
      else {
        const result = await updateTicketStatus(ticket, target!, csrfToken, signal); signal.throwIfAborted();
        setOverride({ base: state.data, value: result.ticket }); setUnknown(false); setMessage('Ticket status updated.'); onAccepted();
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      const status = error instanceof AuthError ? error.status : undefined;
      if (status && [401, 403, 404].includes(status)) { state.revoke(status); setOverride(undefined); }
      else if (status === 429) { setRetryAt(Date.now() + ((error as AuthError).retryAfter ?? 30) * 1000); setMessage('Too many requests. Wait before trying again.'); }
      else {
        setUnknown(true); setMessage('Checking the ticket status...');
        try { await reconcile(AbortSignal.any([controller.signal, AbortSignal.timeout(15000)])); }
        catch (failure) {
          if (controller.signal.aborted) return;
          if (failure instanceof AuthError && [401, 403, 404].includes(failure.status)) { state.revoke(failure.status); setOverride(undefined); }
          else { if (failure instanceof AuthError && failure.status === 429) setRetryAt(Date.now() + (failure.retryAfter ?? 30) * 1000); setUnknown(true); setMessage('Unable to confirm the result. Check status before changing status again.'); }
        }
      }
    } finally { if (!controller.signal.aborted) { locked.current = false; setBusy(false); } }
  }

  return (
    <article aria-label="Ticket details" className="tw:min-w-0 tw:flex-1 tw:overflow-y-auto tw:p-4 tw:sm:p-6 tw:lg:p-8 tw:bg-slate-50 tw:break-words">
      <Link href={back} className="tw:inline-flex tw:items-center tw:gap-1.5 tw:text-xs tw:font-semibold tw:text-blue-600 tw:no-underline tw:hover:text-blue-700 tw:mb-6">
        ‹ Back to tickets
      </Link>
      
      <Notice state={state} />

      {ticket && (
        <div className="tw:mx-auto tw:max-w-4xl tw:space-y-6 tw:min-w-0">
          {/* Main Hero Card */}
          <div className="tw:rounded-2xl tw:border tw:border-slate-200/80 tw:bg-white tw:p-4 tw:sm:p-6 tw:shadow-2xs tw:min-w-0 tw:overflow-hidden">
            <div className="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3 tw:border-b tw:border-slate-100 tw:pb-4 tw:mb-4">
              <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
                <span className="tw:font-mono tw:text-xs tw:font-bold tw:px-2.5 tw:py-1 tw:rounded-lg tw:bg-blue-50 tw:text-blue-700 tw:border tw:border-blue-200/60">
                  {ticket.ticketCode}
                </span>
                <span className="tw:text-xs tw:text-slate-400">Support Ticket</span>
              </div>

              <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-2 tw:w-full tw:sm:w-auto">
                <label htmlFor="ticket-detail-status" className="tw:text-xs tw:font-semibold tw:text-slate-600 tw:shrink-0">
                  Status:
                </label>
                <select 
                  id="ticket-detail-status" 
                  aria-label="Update ticket status" 
                  className={input + " tw:w-full tw:sm:w-auto tw:font-semibold tw:cursor-pointer tw:max-w-full"} 
                  value={ticket.status} 
                  disabled={busy || blocked || cooling || unknown || state.refreshing || !!state.error} 
                  onChange={event => void submit(false, event.target.value as TicketStatus)}>
                  <option value={ticket.status}>{labels[ticket.status]}</option>
                  {(ticket.allowedActions.transitions ?? []).filter(value => value !== ticket.status).map(value => (
                    <option key={value} value={value}>{labels[value]}</option>
                  ))}
                </select>
              </div>
            </div>

            <h2 className="tw:break-words tw:text-xl tw:font-bold tw:text-slate-900 tw:leading-snug">
              {ticket.title}
            </h2>

            <div className="tw:mt-3 tw:flex tw:flex-wrap tw:items-center tw:gap-2 tw:text-xs">
              <span className="tw:text-slate-500">Customer:</span>
              <Link 
                href={`/staff/customers/${ticket.customer.id}`} 
                className="tw:font-semibold tw:text-blue-600 tw:hover:text-blue-700 tw:no-underline tw:break-words">
                {ticket.customer.fullName} · <span className="tw:font-mono">{ticket.customer.accountCode}</span>
              </Link>
            </div>

            <dl className="tw:mt-6 tw:grid tw:grid-cols-1 tw:gap-4 tw:border-t tw:border-slate-100 tw:pt-5 tw:text-xs tw:sm:grid-cols-2">
              <div className="tw:min-w-0">
                <dt className="tw:text-slate-400 tw:font-medium">Created</dt>
                <dd className="tw:mt-1 tw:font-semibold tw:text-slate-800 tw:break-words">{new Date(ticket.createdAt).toLocaleString()}</dd>
              </div>
              <div className="tw:min-w-0">
                <dt className="tw:text-slate-400 tw:font-medium">Linked Policy</dt>
                <dd className="tw:mt-1 tw:font-mono tw:font-bold tw:text-blue-700 tw:break-words">
                  {ticket.policy?.policyNumber ?? 'No linked policy'}
                </dd>
              </div>
            </dl>
          </div>

          {/* AI Context Summary Card (Matching user mockup layout) */}
          {ticket.aiSummary && !ticket.confirmedContent && (
            <div className="tw:rounded-2xl tw:border tw:border-indigo-200/80 tw:bg-gradient-to-b tw:from-indigo-50/40 tw:to-white tw:p-4 tw:sm:p-5 tw:shadow-2xs tw:min-w-0 tw:overflow-hidden">
              <div className="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-2 tw:mb-3">
                <div className="tw:flex tw:items-center tw:gap-2 tw:min-w-0">
                  <span className="tw:w-6 tw:h-6 tw:rounded-lg tw:bg-indigo-100 tw:text-indigo-600 tw:grid tw:place-items-center tw:text-xs tw:shrink-0">
                    ✨
                  </span>
                  <h3 className="tw:text-xs tw:font-bold tw:uppercase tw:tracking-wider tw:text-indigo-900 tw:break-words">
                    Legacy summary
                  </h3>
                </div>
                <span className="tw:inline-flex tw:items-center tw:px-2 tw:py-0.5 tw:rounded-full tw:text-[10px] tw:font-bold tw:bg-emerald-50 tw:text-emerald-700 tw:border tw:border-emerald-200/60 tw:shrink-0">
                  Unverified content
                </span>
              </div>
              <p className="tw:whitespace-pre-wrap tw:break-words tw:text-xs tw:leading-relaxed tw:text-slate-700">
                {ticket.aiSummary}
              </p>
            </div>
          )}

          {/* Customer Confirmation Banner */}
          <div className="tw:rounded-2xl tw:border tw:border-slate-200/80 tw:bg-white tw:p-4 tw:sm:p-5 tw:text-xs tw:shadow-2xs tw:min-w-0">
            <h3 className="tw:font-bold tw:text-slate-800 tw:mb-1 tw:break-words">Customer confirmation notice</h3>
            <p className="tw:text-slate-500 tw:leading-relaxed tw:break-words">
              {ticket.confirmedContent ? (ticket.confirmationSource === 'CUSTOMER_SUBMITTED' ? 'Submitted by the customer.' : 'Draft content confirmed by the customer.') : 'This legacy ticket has no saved snapshot of the content confirmed by the customer. Its confirmation time does not verify this legacy summary.'}
            </p>
          </div>

          {ticket.confirmedContent && <section aria-label="Confirmed ticket content" className="tw:rounded-xl tw:border tw:border-slate-200 tw:p-4 tw:text-sm">
            <h3 className="tw:font-semibold">{ticket.confirmedContent.title}</h3>
            <p className="tw:whitespace-pre-wrap tw:break-words">{ticket.confirmedContent.description}</p>
            <p>{ticket.confirmedContent.policyNumber || 'No related policy'}</p>
          </section>}
          {/* Bottom Actions */}
          <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-3">
            {unknown && (
              <button 
                className={button} 
                disabled={busy || blocked || cooling} 
                onClick={() => void submit(true)}>
                {busy ? 'Checking...' : 'Check status'}
              </button>
            )}
            {ticket.chatLink && (
              <Link 
                className="tw:inline-flex tw:items-center tw:gap-2 tw:rounded-xl tw:bg-blue-600 tw:text-white tw:px-4 tw:py-2 tw:text-xs tw:font-bold tw:shadow-2xs tw:hover:bg-blue-700 tw:no-underline tw:transition-all" 
                href={ticket.chatLink.href}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                {ticket.chatLink.capability === 'TRANSCRIPT' ? 'Open conversation' : 'View support request'}
              </Link>
            )}
          </div>

          {message && (
            <p role="status" className="tw:text-xs tw:font-medium tw:text-slate-700 tw:bg-slate-100 tw:p-3 tw:rounded-xl">
              {message}
            </p>
          )}
        </div>
      )}
    </article>
  );
}

export function StaffTickets({ csrfToken, blocked }: { csrfToken: string; blocked: boolean }) {
  const pathname = usePathname(), search = useSearchParams(), id = pathname.split('/')[3];
  const term = search.get('search') ?? '', status = search.get('status') ?? '', customerId = search.get('customerId') ?? '';
  const filters = new URLSearchParams(); if (term) filters.set('search', term); if (status) filters.set('status', status); if (customerId) filters.set('customerId', customerId);
  const key = filters.toString(), suffix = key ? `?${key}` : '', back = `/staff/tickets${suffix}`;
  const searchInput = useRef<HTMLInputElement>(null);
  useEffect(() => { if (searchInput.current) searchInput.current.value = term; }, [term]);
  const snapshot = useRef<{ key: string; value: TicketList; pages: number } | null>(null), more = useRef(false);
  const state = useAuthorizedRead(key, async signal => {
    const previous = snapshot.current?.key === key ? snapshot.current : null, append = more.current; more.current = false;
    let cursor = append ? previous?.value.pageInfo.nextCursor ?? null : null;
    const items = new Map((append ? previous?.value.items ?? [] : []).map(item => [item.id, item]));
    let pages = append ? previous?.pages ?? 0 : 0, page: TicketList;
    do { page = await listTickets(key, cursor, signal); signal.throwIfAborted(); page.items.forEach(item => items.set(item.id, item)); cursor = page.pageInfo.nextCursor; pages++; }
    while (!append && cursor && pages < (previous?.pages ?? 1));
    const value = { items: [...items.values()], pageInfo: page.pageInfo }; snapshot.current = { key, value, pages }; return value;
  }, true, { eventName: ticketEvent });

  function filter(nextTerm: string, nextStatus: string) {
    const q = new URLSearchParams(); if (nextTerm.trim()) q.set('search', nextTerm.trim()); if (nextStatus) q.set('status', nextStatus); if (customerId) q.set('customerId', customerId);
    window.history.pushState(null, '', '/staff/tickets' + (q.size ? `?${q}` : ''));
  }

  return (
    <section aria-label="Tickets" className="tw:flex tw:min-h-0 tw:min-w-0 tw:flex-1 tw:flex-col tw:bg-slate-50 tw:h-full">
      <header className="tw:shrink-0 tw:border-b tw:border-slate-200/80 tw:bg-white tw:px-6 tw:py-3.5 tw:shadow-2xs">
        <h1 className="tw:text-lg tw:font-bold tw:text-slate-900">Tickets</h1>
        <p className="tw:mt-0.5 tw:text-xs tw:text-slate-500">
          Track and manage support tickets assigned to you.
        </p>
      </header>

      {id ? (
        <TicketDetail key={id} id={id} csrfToken={csrfToken} blocked={blocked} onAccepted={state.retry} back={back} />
      ) : (
        <section aria-label="Ticket results" className="tw:min-h-0 tw:flex-1 tw:overflow-y-auto tw:p-6">
          {/* Filters Form */}
          <form 
            onSubmit={event => { 
              event.preventDefault(); 
              filter(String(new FormData(event.currentTarget).get('search') ?? ''), status); 
            }} 
            className="tw:mb-6 tw:flex tw:flex-wrap tw:items-end tw:gap-4">
            <div className="tw:w-full tw:max-w-md">
              <label className="tw:mb-1.5 tw:block tw:text-xs tw:font-bold tw:text-slate-700" htmlFor="ticket-search">
                Search tickets
              </label>
              <div className="tw:relative">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="tw:absolute tw:left-3 tw:top-1/2 tw:-translate-y-1/2 tw:text-slate-400 tw:pointer-events-none">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input 
                  ref={searchInput} 
                  id="ticket-search" 
                  name="search" 
                  type="search" 
                  maxLength={100} 
                  defaultValue={term} 
                  placeholder="Customer name, code or ticket code" 
                  className={input + " tw:pl-9"} 
                />
              </div>
            </div>

            <div className="tw:w-full tw:sm:w-52">
              <label className="tw:mb-1.5 tw:block tw:text-xs tw:font-bold tw:text-slate-700" htmlFor="ticket-status">
                Ticket status
              </label>
              <select 
                id="ticket-status" 
                value={status} 
                className={input} 
                onChange={event => filter(term, event.target.value)}>
                <option value="">All statuses</option>
                {ticketStatuses.map(value => (
                  <option key={value} value={value}>{labels[value]}</option>
                ))}
              </select>
            </div>
          </form>

          <Notice state={state} />

          {/* Tickets Table / List */}
          <div className="tw:rounded-2xl tw:border tw:border-slate-200/80 tw:bg-white tw:shadow-2xs tw:overflow-hidden">
            <div aria-hidden="true" className="tw:hidden tw:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_140px_160px] tw:gap-4 tw:border-b tw:border-slate-100 tw:bg-slate-50/70 tw:px-6 tw:py-3.5 tw:text-[11px] tw:font-bold tw:uppercase tw:tracking-wider tw:text-slate-500 tw:lg:grid">
              <span>Ticket</span>
              <span>Customer</span>
              <span>Status</span>
              <span>Created</span>
            </div>

            <div className="tw:divide-y tw:divide-slate-100">
              {state.data?.items.map(item => (
                <Link 
                  key={item.id} 
                  href={`/staff/tickets/${item.id}${suffix}`} 
                  className="tw:grid tw:grid-cols-[minmax(0,1fr)_auto] tw:items-center tw:gap-4 tw:px-6 tw:py-4 tw:text-xs tw:text-slate-900 tw:no-underline tw:hover:bg-slate-50/70 tw:transition-colors tw:lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_140px_160px]">
                  <div className="tw:min-w-0">
                    <span className="tw:font-mono tw:text-xs tw:font-bold tw:text-blue-700">{item.ticketCode}</span>
                    <p className="tw:mt-1 tw:break-words tw:font-bold tw:text-slate-900">{item.title}</p>
                    <p className="tw:mt-1 tw:text-[11px] tw:text-slate-500 tw:lg:hidden">{item.customer.fullName}</p>
                  </div>
                  <div className="tw:hidden tw:min-w-0 tw:lg:block">
                    <p className="tw:font-medium tw:text-slate-800">{item.customer.fullName}</p>
                    <p className="tw:font-mono tw:text-[11px] tw:text-slate-400">{item.customer.accountCode}</p>
                  </div>
                  <div>
                    <Status value={item.status} />
                  </div>
                  <time dateTime={item.createdAt} className="tw:hidden tw:text-[11px] tw:text-slate-500 tw:lg:block">
                    {new Date(item.createdAt).toLocaleString()}
                  </time>
                </Link>
              ))}
            </div>

            {state.data && !state.data.items.length && (
              <div className="tw:py-12 tw:text-center tw:text-xs tw:text-slate-500">
                No tickets match these filters.
              </div>
            )}
          </div>

          {state.data?.pageInfo.hasMore && (
            <button 
              className={button + ' tw:mt-5'} 
              disabled={state.loading || state.refreshing || state.retryDisabled || !!state.error} 
              onClick={() => { more.current = true; state.retry(); }}>
              Load more tickets
            </button>
          )}
        </section>
      )}
    </section>
  );
}
