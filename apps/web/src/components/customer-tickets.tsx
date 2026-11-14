'use client';

import { useEffect, useRef, useState } from 'react';
import {
  customerListTickets,
  customerReadTicket,
  submitCustomerTicketIntent,
  type CustomerTicketIntent,
  type CustomerTicketSummary,
  type CustomerTicketDetail,
  type TicketStatus,
} from '@/lib/ticket-api';
import { CustomerTicketPolicySelect } from './customer-ticket-policy-select';
import { AuthError } from '@/lib/auth-api';
import { ticketEvent } from '@/lib/realtime';

export type TicketItem = {
  id: string;
  code: string;
  title: string;
  policyCode: string;
  status: TicketStatus;
  statusLabel: string;
  createdAt: string;
};

const statusStyles: Record<TicketStatus, { style: string; label: string }> = {
  OPEN: {
    style: 'tw:bg-amber-50 tw:text-amber-700 tw:border-amber-200/60',
    label: 'Open',
  },
  ASSIGNED: {
    style: 'tw:bg-blue-50 tw:text-blue-700 tw:border-blue-200/60',
    label: 'Assigned',
  },
  IN_PROGRESS: {
    style: 'tw:bg-emerald-50 tw:text-emerald-700 tw:border-emerald-200/60',
    label: 'In Progress',
  },
  RESOLVED: {
    style: 'tw:bg-purple-50 tw:text-purple-700 tw:border-purple-200/60',
    label: 'Resolved',
  },
  CLOSED: {
    style: 'tw:bg-slate-100 tw:text-slate-600 tw:border-slate-200/60',
    label: 'Closed',
  },
};

function CustomerTicketPanel({
  onOpenChat,
  csrfToken = '',
  blocked = false,
  initialTicketId = null,
}: {
  onOpenChat: () => void;
  initialTicketId?: string | null;
  csrfToken?: string;
  blocked?: boolean;
}) {
  const [tickets, setTickets] = useState<CustomerTicketSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filter, setFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [revision, setRevision] = useState(0);

  // Detail Modal
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(initialTicketId);
  const [ticketDetail, setTicketDetail] = useState<CustomerTicketDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Create Modal
  const intent = useRef<CustomerTicketIntent | null>(null);
  const command = useRef<AbortController | null>(null);
  const [unresolved, setUnresolved] = useState(false);
  const [success, setSuccess] = useState('');
  useEffect(() => () => { command.current?.abort(); command.current = null; intent.current = null; }, []);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [selectedPolicyId, setSelectedPolicyId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const createDialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!createModalOpen) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    createDialog.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); command.current?.abort(); command.current = null; setSubmitting(false); setCreateModalOpen(false); }
    };
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('keydown', escape); if (previous?.isConnected) previous.focus(); };
  }, [createModalOpen]);


  // Realtime WebSocket listener
  useEffect(() => {
    function handleRealtime() {
      setRevision((r) => r + 1);
    }
    window.addEventListener(ticketEvent, handleRealtime);
    return () => window.removeEventListener(ticketEvent, handleRealtime);
  }, []);

  // Fetch ticket list
  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    async function fetchTickets() {
      setLoading(true);
      setError(null);
      try {
        const res = await customerListTickets(
          {
            status: filter === 'ALL' ? undefined : filter,
            search: searchTerm.trim() || undefined,
            page,
            pageSize: 10,
          },
          controller.signal,
        );
        if (!active) return;
        setTickets(res.items);
        setTotal(res.total);
      } catch (err: unknown) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Unable to load support tickets.');
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchTickets();

    return () => {
      active = false;
      controller.abort();
    };
  }, [filter, searchTerm, page, revision]);

  // Fetch ticket detail
  useEffect(() => {
    if (!selectedTicketId) {
      return;
    }

    let active = true;
    const controller = new AbortController();

    async function fetchDetail() {
      setDetailLoading(true);
      try {
        const res = await customerReadTicket(selectedTicketId!, controller.signal);
        if (!active) return;
        setTicketDetail(res.ticket);
      } catch {
        if (!active) return;
        setTicketDetail(null);
      } finally {
        if (active) setDetailLoading(false);
      }
    }

    fetchDetail();

    return () => {
      active = false;
      controller.abort();
    };
  }, [selectedTicketId]);

  const handleCreateTicket = async () => {
    if (blocked || command.current) return;
    if (!intent.current && (!newSubject.trim() || !newDesc.trim())) { setSubmitError('Enter a title and description.'); return; }
    const checking = Boolean(intent.current);
    if (!intent.current) intent.current = { key: crypto.randomUUID(), operation: 'MANUAL', title: newSubject.trim(), description: newDesc.trim(), policyId: selectedPolicyId || null };
    const current = intent.current, controller = new AbortController(); command.current = controller;
    setSubmitting(true); setUnresolved(true); setSubmitError(null);
    try {
      const res = await submitCustomerTicketIntent(current, csrfToken, controller.signal, checking);
      if (controller.signal.aborted || command.current !== controller || intent.current !== current) return;
      intent.current = null; setUnresolved(false); setNewSubject(''); setNewDesc(''); setSelectedPolicyId('');
      setCreateModalOpen(false); setRevision(r => r + 1);
      setSuccess(`Support ticket ${res.ticket.ticketCode} has been created.`); setSelectedTicketId(res.ticket.id);
    } catch (err) {
      if (!controller.signal.aborted && command.current === controller) {
        setSubmitError(err instanceof AuthError && err.status === 400
          ? 'Check the title, description and related policy, then try again.'
          : err instanceof Error ? err.message : 'Unable to confirm the result. Check and retry.');
        if (err instanceof AuthError && [400, 404, 409].includes(err.status)) { intent.current = null; setUnresolved(false); }
      }
    } finally {
      if (command.current === controller) { command.current = null; setSubmitting(false); }
    }
  };
  function closeCreate() { command.current?.abort(); command.current = null; setSubmitting(false); setCreateModalOpen(false); }

  return (
    <div className="tw:space-y-6 tw:animate-in tw:fade-in-50">
      
      {success && <p role="status" className="tw:text-sm tw:text-emerald-700">{success}</p>}
      {/* Top Header Card & Filter Bar */}
      <div className="tw:bg-white tw:border tw:border-slate-200/80 tw:rounded-2xl tw:p-6 tw:shadow-xs">
        <div className="tw:flex tw:flex-col tw:sm:flex-row tw:sm:items-center tw:justify-between tw:gap-4 tw:mb-4">
          <div>
            <h2 className="tw:text-lg tw:font-extrabold tw:text-slate-900 tw:tracking-tight">
              Support Tickets &amp; Service Requests
            </h2>
            <p className="tw:text-xs tw:text-slate-500 tw:mt-0.5">
              Track support requests for your insurance policies.
            </p>
          </div>
          <button
            type="button"
            aria-label="New support ticket"
            disabled={blocked}
            onClick={() => {
              setSubmitError(null);
              setCreateModalOpen(true);
            }}
            className="tw:py-2 tw:px-4 tw:rounded-xl tw:bg-emerald-600 tw:hover:bg-emerald-700 tw:disabled:opacity-40 tw:text-white tw:text-xs tw:font-bold tw:flex tw:items-center tw:gap-1.5 tw:shadow-xs tw:cursor-pointer tw:self-start tw:sm:self-auto"
          >
            <span className="tw:text-sm">＋</span>
            New support ticket
          </button>
        </div>

        {/* Filter & Search Bar */}
        <div className="tw:flex tw:flex-col tw:sm:flex-row tw:items-start tw:sm:items-center tw:justify-between tw:gap-3 tw:pt-3 tw:border-t tw:border-slate-100">
          <div className="tw:flex tw:gap-1.5 tw:overflow-x-auto tw:w-full tw:sm:w-auto tw:pb-1 tw:sm:pb-0">
            {[
              { id: 'ALL', label: 'All' },
              { id: 'OPEN', label: 'Open' },
              { id: 'ASSIGNED', label: 'Assigned' },
              { id: 'IN_PROGRESS', label: 'In progress' },
              { id: 'RESOLVED', label: 'Resolved' },
              { id: 'CLOSED', label: 'Closed' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setFilter(tab.id);
                  setPage(1);
                }}
                className={`tw:px-3 tw:py-1.5 tw:rounded-xl tw:text-xs tw:font-semibold tw:cursor-pointer tw:transition-colors tw:whitespace-nowrap ${
                  filter === tab.id
                    ? 'tw:bg-slate-900 tw:text-white'
                    : 'tw:bg-slate-100 tw:text-slate-600 tw:hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="tw:relative tw:w-full tw:sm:w-64">
            <input
              type="text"
              aria-label="Search support tickets" maxLength={100} placeholder="Search by ticket code or title..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              className="tw:w-full tw:rounded-xl tw:border tw:border-slate-200 tw:bg-slate-50 tw:px-3 tw:py-1.5 tw:text-xs tw:text-slate-800 tw:focus:outline-hidden tw:focus:border-emerald-500 tw:focus:bg-white"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="tw:absolute tw:right-2.5 tw:top-1/2 tw:-translate-y-1/2 tw:text-slate-400 tw:hover:text-slate-600 tw:text-xs tw:cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Ticket List View */}
      {loading ? (
        <div className="tw:py-12 tw:text-center tw:text-xs tw:text-slate-500">
          <div className="tw:inline-block tw:w-5 tw:h-5 tw:border-2 tw:border-emerald-600 tw:border-t-transparent tw:rounded-full tw:animate-spin tw:mb-2" />
          <p>Loading support tickets...</p>
        </div>
      ) : error ? (
        <div className="tw:p-4 tw:rounded-2xl tw:bg-red-50 tw:border tw:border-red-200 tw:text-xs tw:text-red-700">
          {error}
        </div>
      ) : tickets.length === 0 ? (
        <div className="tw:bg-white tw:border tw:border-slate-200/80 tw:rounded-2xl tw:p-12 tw:text-center tw:space-y-3">
          <div className="tw:w-12 tw:h-12 tw:rounded-full tw:bg-slate-100 tw:text-slate-400 tw:flex tw:items-center tw:justify-center tw:mx-auto tw:text-xl">
            📋
          </div>
          <div className="tw:text-sm tw:font-bold tw:text-slate-700">No support tickets</div>
          <p className="tw:text-xs tw:text-slate-400 tw:max-w-sm tw:mx-auto">
            {searchTerm || filter !== 'ALL'
              ? 'No tickets match these filters.'
              : 'Bạn chưa tạo yêu cầu hỗ trợ nào. Bấm "New support ticket" hoặc trao đổi với AI Agent trong hội thoại chat.'}
          </p>
        </div>
      ) : (
        <div className="tw:grid tw:grid-cols-1 tw:gap-3">
          {tickets.map((t) => {
            const statusInfo = statusStyles[t.status] || {
              style: 'tw:bg-slate-100 tw:text-slate-700 tw:border-slate-200',
              label: t.status,
            };
            return (
              <div
                key={t.id}
                onClick={() => setSelectedTicketId(t.id)}
                className="tw:bg-white tw:border tw:border-slate-200/80 tw:rounded-2xl tw:p-4 tw:shadow-xs tw:hover:border-slate-300 tw:hover:shadow-sm tw:transition-all tw:cursor-pointer tw:flex tw:items-center tw:justify-between tw:gap-4"
              >
                <div className="tw:space-y-1 tw:min-w-0">
                  <div className="tw:flex tw:items-center tw:gap-2">
                    <span className="tw:font-mono tw:font-bold tw:text-xs tw:text-emerald-700">
                      {t.ticketCode}
                    </span>
                    <span
                      className={`tw:px-2 tw:py-0.5 tw:rounded-full tw:text-[10px] tw:font-bold tw:border ${statusInfo.style}`}
                    >
                      {statusInfo.label}
                    </span>
                    {t.policyNumber && (
                      <span className="tw:text-[11px] tw:text-slate-400">
                        • Policy: <strong className="tw:text-slate-600">{t.policyNumber}</strong>
                      </span>
                    )}
                  </div>
                  <h4 className="tw:text-sm tw:font-bold tw:text-slate-900 tw:truncate">
                    {t.title}
                  </h4>
                  <p className="tw:text-[11px] tw:text-slate-400">
                    Created: {new Date(t.createdAt).toLocaleDateString('en-GB')}
                  </p>
                </div>

                <div className="tw:flex tw:items-center tw:gap-2 tw:shrink-0">
                  <span className="tw:text-xs tw:font-semibold tw:text-emerald-600 tw:hidden tw:sm:inline">
                    View details →
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <nav aria-label="Ticket pagination" className="tw:flex tw:items-center tw:justify-between tw:text-sm">
        <span>{total} tickets ? Page {page}</span>
        <button type="button" disabled={loading || page <= 1} onClick={() => setPage(value => value - 1)}>Previous</button>
        <button type="button" disabled={loading || page * 10 >= total} onClick={() => setPage(value => value + 1)}>Next</button>
      </nav>
      {/* DETAIL MODAL */}
      {selectedTicketId && (
        <div
          role="dialog"
          aria-label="Ticket details"
          aria-modal="true"
          className="tw:fixed tw:inset-0 tw:bg-slate-900/40 tw:backdrop-blur-xs tw:z-50 tw:flex tw:items-center tw:justify-center tw:p-4"
        >
          <div className="tw:bg-white tw:rounded-2xl tw:max-w-lg tw:w-full tw:shadow-2xl tw:overflow-hidden tw:border tw:border-slate-200 tw:space-y-4 tw:p-6 tw:animate-in tw:fade-in-50">
            <div className="tw:flex tw:items-center tw:justify-between tw:border-b tw:border-slate-100 tw:pb-3">
              <div>
                <span className="tw:font-mono tw:font-bold tw:text-xs tw:text-emerald-700">
                  {ticketDetail?.ticketCode || 'Ticket details'}
                </span>
                <h3 className="tw:text-sm tw:font-bold tw:text-slate-900 tw:mt-0.5">
                  {ticketDetail?.title || 'Loading...'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTicketId(null)}
                className="tw:text-slate-400 tw:hover:text-slate-600 tw:p-1 tw:rounded-lg tw:cursor-pointer"
              >
                ✕
              </button>
            </div>

            {detailLoading ? (
              <div className="tw:py-8 tw:text-center tw:text-xs tw:text-slate-500">
                <div className="tw:inline-block tw:w-5 tw:h-5 tw:border-2 tw:border-emerald-600 tw:border-t-transparent tw:rounded-full tw:animate-spin tw:mb-2" />
                <p>Loading ticket details...</p>
              </div>
            ) : ticketDetail && ticketDetail.id === selectedTicketId ? (
              <div className="tw:space-y-3 tw:text-xs">
                <div className="tw:bg-slate-50 tw:p-3.5 tw:rounded-xl tw:border tw:border-slate-200/70 tw:space-y-2">
                  <div className="tw:flex tw:items-center tw:justify-between">
                    <span className="tw:text-slate-400 tw:font-medium">Status:</span>
                    <span
                      className={`tw:px-2.5 tw:py-0.5 tw:rounded-full tw:text-[11px] tw:font-bold tw:border ${
                        statusStyles[ticketDetail.status]?.style || ''
                      }`}
                    >
                      {statusStyles[ticketDetail.status]?.label || ticketDetail.status}
                    </span>
                  </div>

                  {ticketDetail.policyNumber && (
                    <div className="tw:flex tw:items-center tw:justify-between">
                      <span className="tw:text-slate-400 tw:font-medium">Related policy:</span>
                      <span className="tw:font-mono tw:font-semibold tw:text-slate-800">
                        {ticketDetail.policyNumber}
                      </span>
                    </div>
                  )}

                  <div className="tw:flex tw:items-center tw:justify-between">
                    <span className="tw:text-slate-400 tw:font-medium">Created:</span>
                    <span className="tw:text-slate-700">
                      {new Date(ticketDetail.createdAt).toLocaleString('en-GB')}
                    </span>
                  </div>

                  {ticketDetail.assignedStaff && (
                    <div className="tw:flex tw:items-center tw:justify-between">
                      <span className="tw:text-slate-400 tw:font-medium">Assigned staff:</span>
                      <span className="tw:font-semibold tw:text-slate-800">
                        {ticketDetail.assignedStaff.fullName}
                      </span>
                    </div>
                  )}
                </div>

                {/* Confirmed / Manual Content */}
                {ticketDetail.confirmedContent && (
                  <div className="tw:bg-white tw:border tw:border-slate-200 tw:rounded-xl tw:p-3.5 tw:space-y-1.5">
                    <span className="tw:text-slate-400 tw:font-medium tw:block">Saved request content:</span>
                    <p className="tw:text-slate-700 tw:whitespace-pre-line tw:leading-relaxed">
                      {(ticketDetail.confirmedContent.description as string) || (ticketDetail.confirmedContent.title as string) || 'No description'}
                    </p>
                  </div>
                )}
              </div>
            ) : null}

            <div className="tw:flex tw:items-center tw:justify-between tw:pt-3 tw:border-t tw:border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setSelectedTicketId(null);
                  onOpenChat();
                }}
                className="tw:px-3.5 tw:py-1.5 tw:rounded-xl tw:bg-blue-50 tw:hover:bg-blue-100 tw:text-blue-700 tw:text-xs tw:font-semibold tw:cursor-pointer tw:flex tw:items-center tw:gap-1.5"
              >
                <span>Contact your advisor</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedTicketId(null)}
                className="tw:px-4 tw:py-1.5 tw:rounded-xl tw:bg-slate-200 tw:hover:bg-slate-300 tw:text-slate-700 tw:text-xs tw:font-semibold tw:cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE MODAL */}
      {createModalOpen && (
        <div
          role="dialog"
          aria-label="New support ticket"
          ref={createDialog} tabIndex={-1}
          aria-modal="true"
          className="tw:fixed tw:inset-0 tw:bg-slate-900/40 tw:backdrop-blur-xs tw:z-50 tw:flex tw:items-center tw:justify-center tw:p-4"
        >
          <div className="tw:bg-white tw:rounded-2xl tw:max-w-md tw:max-h-[90dvh] tw:overflow-y-auto tw:w-full tw:shadow-2xl tw:overflow-hidden tw:border tw:border-slate-200 tw:space-y-4 tw:p-6 tw:animate-in tw:fade-in-50">
            <div className="tw:flex tw:items-center tw:justify-between tw:border-b tw:border-slate-100 tw:pb-3">
              <div>
                <h3 className="tw:text-sm tw:font-bold tw:text-slate-900">New support ticket</h3>
                <p className="tw:text-xs tw:text-slate-500 tw:mt-0.5">Your ticket will start with status Open.</p>
              </div>
              <button
                type="button"
                aria-label="Close request form"
                onClick={closeCreate}
                className="tw:text-slate-400 tw:hover:text-slate-600 tw:p-1 tw:rounded-lg tw:cursor-pointer"
              >
                ✕
              </button>
            </div>

            {submitError && (
              <div role="alert" className="tw:p-3 tw:rounded-xl tw:bg-red-50 tw:border tw:border-red-200 tw:text-xs tw:text-red-700">
                {submitError}
                {unresolved && !submitting && <button type="button" onClick={() => { intent.current = null; setUnresolved(false); setSubmitError(null); setNewSubject(''); setNewDesc(''); setSelectedPolicyId(''); }} className="tw:block tw:mt-2 tw:underline">Start a different request (the previous request may still complete)</button>}
              </div>
            )}

            <div className="tw:space-y-3 tw:text-xs">
              <CustomerTicketPolicySelect value={selectedPolicyId} onChange={setSelectedPolicyId} disabled={unresolved || blocked} />

              <div>
                <label className="tw:block tw:font-semibold tw:text-slate-700 tw:mb-1">
                  Ticket title <span className="tw:text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Briefly describe your request"
                  aria-label="Ticket title" disabled={unresolved || blocked} value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  maxLength={255}
                  className="tw:w-full tw:rounded-xl tw:border tw:border-slate-200 tw:px-3 tw:py-2 tw:text-xs tw:text-slate-900 tw:focus:outline-hidden tw:focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="tw:block tw:font-semibold tw:text-slate-700 tw:mb-1">
                  Description <span className="tw:text-red-500">*</span>
                </label>
                <textarea
                  rows={4}
                  placeholder="Describe what happened and the help you need"
                  aria-label="Ticket description" disabled={unresolved || blocked} value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  maxLength={4000}
                  className="tw:w-full tw:rounded-xl tw:border tw:border-slate-200 tw:px-3 tw:py-2 tw:text-xs tw:text-slate-900 tw:focus:outline-hidden tw:focus:border-emerald-500 tw:resize-none"
                />
              </div>

              <div className="tw:bg-blue-50 tw:border tw:border-blue-200/60 tw:p-3 tw:rounded-xl tw:text-[11px] tw:text-blue-800">
                Your request will be saved as a support ticket.
              </div>
            </div>

            <div className="tw:flex tw:items-center tw:justify-end tw:gap-2 tw:pt-3 tw:border-t tw:border-slate-100">
              <button
                type="button"
                disabled={submitting || blocked}
                onClick={closeCreate}
                className="tw:px-3.5 tw:py-1.5 tw:rounded-xl tw:border tw:border-slate-200 tw:text-slate-600 tw:text-xs tw:font-semibold tw:hover:bg-slate-50 tw:cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting || blocked}
                onClick={handleCreateTicket}
                className="tw:px-4 tw:py-1.5 tw:rounded-xl tw:bg-emerald-600 tw:text-white tw:text-xs tw:font-bold tw:hover:bg-emerald-700 tw:cursor-pointer tw:shadow-xs"
              >
                {submitting ? 'Checking...' : unresolved ? 'Check and retry' : 'Submit request'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export function CustomerTickets(props: Parameters<typeof CustomerTicketPanel>[0]) {
  return props.blocked ? <p role="status">Verifying your session...</p> : <CustomerTicketPanel {...props} />;
}
