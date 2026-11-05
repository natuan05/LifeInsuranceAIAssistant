'use client';

import { useState } from 'react';

export type TicketItem = {
  code: string;
  title: string;
  policyCode: string;
  status: 'IN_PROGRESS' | 'RESOLVED';
  statusLabel: string;
  createdAt: string;
  estimatedDate?: string;
  resolvedAt?: string;
};

const initialTickets: TicketItem[] = [
  {
    code: 'TK-7702',
    title: 'Hospitalization 4-day medical benefit claim',
    policyCode: '#DEV-POL-A-001',
    status: 'IN_PROGRESS',
    statusLabel: 'In Progress',
    createdAt: '22/10/2026',
    estimatedDate: '06/11/2026',
  },
  {
    code: 'TK-7705',
    title: 'Automatic Premium Loan (APL) confirmation',
    policyCode: '#DEV-POL-A-001',
    status: 'RESOLVED',
    statusLabel: 'Resolved',
    createdAt: '02/11/2026',
    resolvedAt: '02/11/2026',
  },
  {
    code: 'TK-7710',
    title: 'Contact information & phone update request',
    policyCode: '#DEV-POL-A-001',
    status: 'RESOLVED',
    statusLabel: 'Resolved',
    createdAt: '15/09/2026',
    resolvedAt: '15/09/2026',
  },
];

export function CustomerTickets({ onOpenChat }: { onOpenChat: () => void }) {
  const [tickets, setTickets] = useState<TicketItem[]>(initialTickets);
  const [filter, setFilter] = useState<'all' | 'in_progress' | 'resolved'>('all');
  const [selectedTicket, setSelectedTicket] = useState<TicketItem | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newDesc, setNewDesc] = useState('');

  const filteredTickets = tickets.filter(t => {
    if (filter === 'in_progress') return t.status === 'IN_PROGRESS';
    if (filter === 'resolved') return t.status === 'RESOLVED';
    return true;
  });

  const handleCreateTicket = () => {
    if (!newSubject.trim()) {
      alert('Please enter a ticket title.');
      return;
    }
    const code = `TK-${Math.floor(7700 + Math.random() * 99)}`;
    const newTicket: TicketItem = {
      code,
      title: newSubject.trim(),
      policyCode: '#DEV-POL-A-001',
      status: 'IN_PROGRESS',
      statusLabel: 'In Progress',
      createdAt: 'Today',
      estimatedDate: 'Within 24 hours',
    };
    setTickets([newTicket, ...tickets]);
    setNewSubject('');
    setNewDesc('');
    setCreateModalOpen(false);
    alert(`Support ticket #${code} created successfully. Our assessment team will respond within 24 hours.`);
  };

  return (
    <div className="tw:space-y-6 tw:animate-in tw:fade-in-50">
      
      {/* Top Header Card & Filter Bar */}
      <div className="tw:bg-white tw:border tw:border-slate-200/80 tw:rounded-2xl tw:p-6 tw:shadow-xs">
        <div className="tw:flex tw:flex-col tw:sm:flex-row tw:sm:items-center tw:justify-between tw:gap-4 tw:mb-4">
          <div>
            <h2 className="tw:text-lg tw:font-extrabold tw:text-slate-900 tw:tracking-tight">
              Support Tickets &amp; Service Requests
            </h2>
            <p className="tw:text-xs tw:text-slate-500 tw:mt-0.5">
              Track hospitalization claims (e-Claim), indemnities, and policy administrative services
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCreateModalOpen(true)}
            className="tw:py-2 tw:px-4 tw:rounded-xl tw:bg-emerald-600 tw:hover:bg-emerald-700 tw:text-white tw:text-xs tw:font-bold tw:flex tw:items-center tw:gap-1.5 tw:shadow-xs tw:cursor-pointer tw:self-start tw:sm:self-auto"
          >
            <span>+ New Request</span>
          </button>
        </div>

        {/* Filter Pills */}
        <div className="tw:flex tw:items-center tw:gap-2 tw:flex-wrap tw:pt-3 tw:border-t tw:border-slate-100">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`tw:px-3 tw:py-1.5 tw:rounded-full tw:text-xs tw:font-semibold tw:transition-all tw:cursor-pointer ${
              filter === 'all'
                ? 'tw:bg-blue-50 tw:text-blue-700 tw:border tw:border-blue-200'
                : 'tw:bg-slate-100 tw:text-slate-600 tw:hover:bg-slate-200/80 tw:border tw:border-transparent'
            }`}
          >
            All Requests ({tickets.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('in_progress')}
            className={`tw:px-3 tw:py-1.5 tw:rounded-full tw:text-xs tw:font-semibold tw:transition-all tw:cursor-pointer ${
              filter === 'in_progress'
                ? 'tw:bg-blue-50 tw:text-blue-700 tw:border tw:border-blue-200'
                : 'tw:bg-slate-100 tw:text-slate-600 tw:hover:bg-slate-200/80 tw:border tw:border-transparent'
            }`}
          >
            In Progress ({tickets.filter(t => t.status === 'IN_PROGRESS').length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('resolved')}
            className={`tw:px-3 tw:py-1.5 tw:rounded-full tw:text-xs tw:font-semibold tw:transition-all tw:cursor-pointer ${
              filter === 'resolved'
                ? 'tw:bg-blue-50 tw:text-blue-700 tw:border tw:border-blue-200'
                : 'tw:bg-slate-100 tw:text-slate-600 tw:hover:bg-slate-200/80 tw:border tw:border-transparent'
            }`}
          >
            Resolved ({tickets.filter(t => t.status === 'RESOLVED').length})
          </button>
        </div>
      </div>

      {/* Tickets List */}
      <div className="tw:space-y-3">
        {filteredTickets.map(ticket => (
          <div
            key={ticket.code}
            className="tw:bg-white tw:border tw:border-slate-200/80 tw:rounded-2xl tw:p-5 tw:shadow-xs tw:flex tw:flex-col tw:sm:flex-row tw:sm:items-center tw:justify-between tw:gap-4 tw:hover:border-slate-300 tw:transition-all"
          >
            <div className="tw:flex tw:items-start tw:gap-3.5 tw:min-w-0 tw:flex-1">
              <div className="tw:w-10 tw:h-10 tw:rounded-xl tw:bg-slate-50 tw:border tw:border-slate-200/80 tw:text-slate-600 tw:flex tw:items-center tw:justify-center tw:shrink-0">
                {ticket.status === 'IN_PROGRESS' ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </div>

              <div className="tw:min-w-0 tw:flex-1">
                <div className="tw:flex tw:items-center tw:gap-2.5 tw:flex-wrap">
                  <h3 className="tw:text-sm tw:font-bold tw:text-slate-900 tw:m-0">
                    {ticket.title}
                  </h3>
                  <span
                    className={`tw:inline-flex tw:items-center tw:gap-1.5 tw:px-2.5 tw:py-0.5 tw:rounded-full tw:text-xs tw:font-semibold ${
                      ticket.status === 'IN_PROGRESS'
                        ? 'tw:bg-blue-50 tw:text-blue-700 tw:border tw:border-blue-200/60'
                        : 'tw:bg-emerald-50 tw:text-emerald-700 tw:border tw:border-emerald-200/60'
                    }`}
                  >
                    <span className="tw:w-1.5 tw:h-1.5 tw:rounded-full tw:bg-current" />
                    {ticket.statusLabel}
                  </span>
                </div>
                <p className="tw:text-xs tw:text-slate-500 tw:mt-1 tw:m-0 tw:flex tw:items-center tw:gap-1.5 tw:flex-wrap">
                  <span className="tw:font-mono tw:font-semibold tw:text-slate-700">#{ticket.code}</span>
                  <span className="tw:text-slate-300">·</span>
                  <span>Policy: <strong className="tw:font-mono tw:font-semibold tw:text-slate-700">{ticket.policyCode}</strong></span>
                  <span className="tw:text-slate-300">·</span>
                  <span>Created: {ticket.createdAt}</span>
                  {ticket.estimatedDate && (
                    <>
                      <span className="tw:text-slate-300">·</span>
                      <span>Est. completion: {ticket.estimatedDate}</span>
                    </>
                  )}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSelectedTicket(ticket)}
              className="tw:self-end tw:sm:self-auto tw:inline-flex tw:items-center tw:gap-1.5 tw:py-2 tw:px-3.5 tw:rounded-xl tw:bg-slate-100 tw:hover:bg-slate-200/80 tw:text-slate-700 tw:text-xs tw:font-semibold tw:transition-all tw:cursor-pointer"
            >
              <span>{ticket.status === 'IN_PROGRESS' ? 'View progress details' : 'View resolution'}</span>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {/* MODAL 1: TIMELINE DETAIL */}
      {selectedTicket && (
        <div className="tw:fixed tw:inset-0 tw:bg-slate-900/40 tw:backdrop-blur-xs tw:z-50 tw:flex tw:items-center tw:justify-center tw:p-4">
          <div className="tw:bg-white tw:rounded-2xl tw:max-w-lg tw:w-full tw:shadow-2xl tw:overflow-hidden tw:border tw:border-slate-200">
            <div className="tw:p-5 tw:border-b tw:border-slate-100 tw:flex tw:items-center tw:justify-between">
              <div>
                <h3 className="tw:text-base tw:font-bold tw:text-slate-900">
                  Resolution progress for ticket #{selectedTicket.code}
                </h3>
                <p className="tw:text-xs tw:text-slate-500 tw:mt-0.5">
                  {selectedTicket.title}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTicket(null)}
                className="tw:text-slate-400 tw:hover:text-slate-600 tw:text-lg tw:cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="tw:p-6 tw:space-y-6">
              {/* Stepped Progress Bar */}
              <div className="tw:flex tw:items-center tw:justify-between tw:relative">
                <div className="tw:flex tw:flex-col tw:items-center tw:text-center tw:flex-1 tw:z-10">
                  <span className="tw:w-7 tw:h-7 tw:rounded-full tw:bg-emerald-600 tw:text-white tw:text-xs tw:font-bold tw:flex tw:items-center tw:justify-center">✓</span>
                  <span className="tw:text-[11px] tw:font-bold tw:text-slate-800 tw:mt-1.5">Submitted</span>
                  <span className="tw:text-[10px] tw:text-slate-400">22/10</span>
                </div>

                <div className="tw:flex tw:flex-col tw:items-center tw:text-center tw:flex-1 tw:z-10">
                  <span className="tw:w-7 tw:h-7 tw:rounded-full tw:bg-emerald-600 tw:text-white tw:text-xs tw:font-bold tw:flex tw:items-center tw:justify-center">✓</span>
                  <span className="tw:text-[11px] tw:font-bold tw:text-slate-800 tw:mt-1.5">Received</span>
                  <span className="tw:text-[10px] tw:text-slate-400">23/10</span>
                </div>

                <div className="tw:flex tw:flex-col tw:items-center tw:text-center tw:flex-1 tw:z-10">
                  <span className="tw:w-7 tw:h-7 tw:rounded-full tw:bg-blue-600 tw:text-white tw:text-xs tw:font-bold tw:flex tw:items-center tw:justify-center tw:ring-4 tw:ring-blue-100">3</span>
                  <span className="tw:text-[11px] tw:font-bold tw:text-blue-700 tw:mt-1.5">Underwriting</span>
                  <span className="tw:text-[10px] tw:text-blue-600">In Progress</span>
                </div>

                <div className="tw:flex tw:flex-col tw:items-center tw:text-center tw:flex-1 tw:z-10">
                  <span className="tw:w-7 tw:h-7 tw:rounded-full tw:bg-slate-100 tw:text-slate-400 tw:border tw:border-slate-300 tw:text-xs tw:font-bold tw:flex tw:items-center tw:justify-center">4</span>
                  <span className="tw:text-[11px] tw:font-medium tw:text-slate-400 tw:mt-1.5">Settlement</span>
                  <span className="tw:text-[10px] tw:text-slate-400">06/11</span>
                </div>
              </div>

              {/* Note Box */}
              <div className="tw:bg-slate-50 tw:border tw:border-slate-200 tw:rounded-xl tw:p-4 tw:text-xs tw:space-y-1">
                <div className="tw:font-bold tw:text-slate-800">Underwriting Assessment Update:</div>
                <p className="tw:text-slate-600 tw:leading-relaxed">
                  Medical records have been transferred to the designated underwriting physician. Hospitalization allowance is scheduled for direct transfer before Nov 6, 2026.
                </p>
              </div>

              {/* Attachments */}
              <div className="tw:space-y-1.5">
                <div className="tw:text-xs tw:font-bold tw:text-slate-800">Attached documents:</div>
                <div className="tw:flex tw:gap-2 tw:flex-wrap">
                  <span className="tw:text-xs tw:bg-slate-100 tw:border tw:border-slate-200 tw:px-2.5 tw:py-1 tw:rounded-lg tw:text-slate-600">
                    📄 Hospital-discharge.pdf (1.2 MB)
                  </span>
                  <span className="tw:text-xs tw:bg-slate-100 tw:border tw:border-slate-200 tw:px-2.5 tw:py-1 tw:rounded-lg tw:text-slate-600">
                    📄 Hospital-fee-summary.pdf (2.4 MB)
                  </span>
                </div>
              </div>
            </div>

            <div className="tw:p-4 tw:border-t tw:border-slate-100 tw:bg-slate-50/50 tw:flex tw:items-center tw:justify-between tw:gap-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedTicket(null);
                  onOpenChat();
                }}
                className="tw:py-2 tw:px-3 tw:rounded-xl tw:bg-blue-50 tw:hover:bg-blue-100 tw:text-blue-700 tw:text-xs tw:font-semibold tw:cursor-pointer tw:flex tw:items-center tw:gap-1.5"
              >
                <span>Message Support Staff</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedTicket(null)}
                className="tw:py-2 tw:px-4 tw:rounded-xl tw:bg-slate-200 tw:hover:bg-slate-300 tw:text-slate-700 tw:text-xs tw:font-semibold tw:cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: CREATE TICKET */}
      {createModalOpen && (
        <div className="tw:fixed tw:inset-0 tw:bg-slate-900/40 tw:backdrop-blur-xs tw:z-50 tw:flex tw:items-center tw:justify-center tw:p-4">
          <div className="tw:bg-white tw:rounded-2xl tw:max-w-md tw:w-full tw:shadow-2xl tw:overflow-hidden tw:border tw:border-slate-200">
            <div className="tw:p-5 tw:border-b tw:border-slate-100 tw:flex tw:items-center tw:justify-between">
              <div>
                <h3 className="tw:text-base tw:font-bold tw:text-slate-900">Create New Support Request</h3>
                <p className="tw:text-xs tw:text-slate-500 tw:mt-0.5">Handled by Claims &amp; Policy Operations Team</p>
              </div>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="tw:text-slate-400 tw:hover:text-slate-600 tw:text-lg tw:cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="tw:p-6 tw:space-y-4">
              <div>
                <label className="tw:block tw:text-xs tw:font-semibold tw:text-slate-700 tw:mb-1">
                  Request Type
                </label>
                <select className="tw:w-full tw:h-9 tw:px-3 tw:rounded-xl tw:border tw:border-slate-200 tw:bg-slate-50 tw:text-xs tw:text-slate-800">
                  <option value="claim">Hospitalization / Medical Indemnity (e-Claim)</option>
                  <option value="profile">Update contact info / ID document</option>
                  <option value="premium">Premium payment plan / Policy reinstatement</option>
                </select>
              </div>

              <div>
                <label className="tw:block tw:text-xs tw:font-semibold tw:text-slate-700 tw:mb-1">
                  Linked Policy
                </label>
                <select className="tw:w-full tw:h-9 tw:px-3 tw:rounded-xl tw:border tw:border-slate-200 tw:bg-slate-50 tw:text-xs tw:text-slate-800">
                  <option value="DEV-POL-A-001">#DEV-POL-A-001 - An Tam Tron Doi</option>
                </select>
              </div>

              <div>
                <label className="tw:block tw:text-xs tw:font-semibold tw:text-slate-700 tw:mb-1">
                  Request Title
                </label>
                <input
                  type="text"
                  value={newSubject}
                  onChange={e => setNewSubject(e.target.value)}
                  placeholder="e.g. Hospitalization claim for recent treatment..."
                  className="tw:w-full tw:h-9 tw:px-3 tw:rounded-xl tw:border tw:border-slate-200 tw:bg-white tw:text-xs tw:text-slate-800 tw:outline-hidden tw:focus:border-blue-500"
                />
              </div>

              <div>
                <label className="tw:block tw:text-xs tw:font-semibold tw:text-slate-700 tw:mb-1">
                  Detailed Description
                </label>
                <textarea
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                  placeholder="Specify hospitalization dates, medical facility, or information to update..."
                  className="tw:w-full tw:h-20 tw:p-3 tw:rounded-xl tw:border tw:border-slate-200 tw:bg-white tw:text-xs tw:text-slate-800 tw:outline-hidden tw:focus:border-blue-500 tw:resize-none"
                />
              </div>

              <div className="tw:bg-blue-50 tw:border tw:border-blue-200 tw:rounded-xl tw:p-3 tw:text-[11px] tw:text-blue-800">
                ℹ️ Your request will be directly routed to our policyholder service operations.
              </div>
            </div>

            <div className="tw:p-4 tw:border-t tw:border-slate-100 tw:bg-slate-50/50 tw:flex tw:justify-end tw:gap-2">
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="tw:py-2 tw:px-4 tw:rounded-xl tw:bg-slate-200 tw:hover:bg-slate-300 tw:text-slate-700 tw:text-xs tw:font-semibold tw:cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateTicket}
                className="tw:py-2 tw:px-4 tw:rounded-xl tw:bg-emerald-600 tw:hover:bg-emerald-700 tw:text-white tw:text-xs tw:font-bold tw:cursor-pointer"
              >
                Submit Request
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
