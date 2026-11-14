'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { StaffCustomerPolicies } from './staff-policies';
import { AuthError } from '@/lib/auth-api';
import { revealCustomerContact } from '@/lib/customer-api';
import type { StaffCustomer, CustomerList } from '@/lib/customer-api';

export function StaffCustomerDirectory({ actorId, csrfToken, blocked, contactRevision, onDenied,
  list, 
  detail, 
  selected, 
  loading, 
  error, 
  page, 
  searchTerm, 
  onSearch, 
  onRetry, 
  onSelect, 
  onBack, 
  onPage 
}: {
  actorId: string;
  csrfToken: string;
  blocked: boolean;
  contactRevision: number;
  onDenied: (status: number) => void;
  list: CustomerList | null;
  detail: StaffCustomer | null;
  selected: string | null;
  loading: boolean;
  error: string;
  page: number;
  searchTerm: string;
  onSearch: (term: string) => void;
  onRetry: () => void;
  onSelect: (id: string) => void;
  onBack: () => void;
  onPage: (page: number) => void;
}) {
  const searchInput = useRef<HTMLInputElement>(null);
  useEffect(() => { 
    if (searchInput.current) searchInput.current.value = searchTerm; 
  }, [searchTerm]);

  return (
    <section 
      aria-label="Customer management"
      className="customer-directory tw:flex-1 tw:min-w-0 tw:w-full tw:flex tw:flex-col tw:bg-slate-50 tw:overflow-auto tw:max-[1000px]:min-h-[600px]">
      
      {/* Top Header */}
      <header className={'customer-directory-header tw:shrink-0 tw:border-b tw:border-slate-200/80 tw:bg-white tw:px-4 tw:sm:px-6 tw:py-3.5 ' + (selected ? 'customer-detail-header' : '')}>
        {selected ? (
          <div className="customer-detail-heading tw:min-w-0 tw:w-full">
            <nav aria-label="Breadcrumb" className="customer-breadcrumb tw:mb-2.5 tw:flex tw:items-center tw:gap-2 tw:text-xs tw:font-medium tw:text-slate-500">
              <button 
                onClick={onBack}
                className="tw:text-slate-500 tw:hover:text-blue-600 tw:transition-colors tw:cursor-pointer">
                Customers
              </button>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="tw:text-slate-400">
                <path d="m9 5 7 7-7 7"/>
              </svg>
              <span className="tw:text-slate-900 tw:font-semibold">Customer details</span>
            </nav>

            <div className="customer-identity tw:flex tw:items-center tw:gap-4">
              <div className="customer-identity-avatar tw:grid tw:place-items-center tw:w-12 tw:h-12 tw:rounded-2xl tw:bg-gradient-to-tr tw:from-blue-600 tw:to-indigo-500 tw:text-white tw:text-lg tw:font-bold tw:shrink-0 tw:shadow-xs">
                {detail?.fullName.slice(0, 1) || '–'}
              </div>
              <div className="tw:min-w-0">
                <h1 className="tw:truncate tw:text-xl tw:font-bold tw:text-slate-900">
                  {detail?.fullName || 'Customer details'}
                </h1>
                <div className="customer-identity-meta tw:mt-1 tw:flex tw:items-center tw:gap-2 tw:text-xs tw:text-slate-500">
                  <span className="tw:font-mono tw:font-medium tw:text-slate-700">{detail?.accountCode || 'Loading profile…'}</span>
                  {detail && (
                    <>
                      <span aria-hidden="true" className="tw:text-slate-300">·</span>
                      <span className={'directory-status tw:inline-flex tw:items-center tw:px-2.5 tw:py-0.5 tw:rounded-full tw:text-[11px] tw:font-semibold ' + (detail.status === 'ACTIVE' ? 'tw:bg-emerald-50 tw:text-emerald-700 tw:border tw:border-emerald-200/60 is-active' : 'tw:bg-amber-50 tw:text-amber-700 tw:border tw:border-amber-200/60')}>
                        {detail.status === 'ACTIVE' ? 'Active' : 'Locked'}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="tw:flex tw:items-center tw:justify-between tw:gap-4">
            <div>
              <h1 className="tw:text-lg tw:font-bold tw:text-slate-900">Customers</h1>
              <p className="tw:mt-0.5 tw:text-xs tw:text-slate-500">
                Customers currently assigned to your portfolio.
              </p>
            </div>
          </div>
        )}
      </header>

      {/* Main Content Body */}
      <div className="customer-directory-content tw:p-4 tw:sm:p-6 tw:max-w-full">
        {/* Search Bar (When listing) */}
        {!selected && (
          <form 
            role="search" 
            aria-label="Search assigned customers" 
            onSubmit={event => { 
              event.preventDefault(); 
              onSearch(String(new FormData(event.currentTarget).get('search') ?? '')); 
            }}
            className="tw:mb-6">
            <div className="tw:max-w-md">
              <label htmlFor="customer-search" className="tw:block tw:text-xs tw:font-semibold tw:text-slate-700 tw:mb-1.5">
                Search customers
              </label>
              <div className="tw:relative">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="tw:absolute tw:left-3.5 tw:top-1/2 tw:-translate-y-1/2 tw:text-slate-400 tw:pointer-events-none">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input 
                  ref={searchInput} 
                  id="customer-search" 
                  name="search" 
                  type="search" 
                  autoComplete="off" 
                  defaultValue={searchTerm} 
                  maxLength={100} 
                  placeholder="Name or customer code"
                  className="tw:w-full tw:pl-10 tw:pr-4 tw:py-2.5 tw:rounded-xl tw:border tw:border-slate-300 tw:bg-white tw:text-xs tw:text-slate-900 tw:placeholder:text-slate-400 tw:focus:outline-hidden tw:focus:border-blue-500 tw:focus:ring-2 tw:focus:ring-blue-100 tw:transition-all" 
                />
              </div>
            </div>
          </form>
        )}

        {/* Loading State */}
        {loading && (
          <div role="status" className="reference-empty tw:py-12 tw:text-center tw:text-xs tw:text-slate-500">
            <div className="tw:inline-block tw:w-5 tw:h-5 tw:border-2 tw:border-blue-600 tw:border-t-transparent tw:rounded-full tw:animate-spin tw:mb-2"/>
            <p>Loading data…</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div role="alert" className="directory-error tw:rounded-2xl tw:border tw:border-red-200 tw:bg-red-50/80 tw:p-4 tw:text-xs tw:text-red-800 tw:flex tw:items-center tw:justify-between tw:mb-6">
            <div className="tw:flex tw:items-center tw:gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span>{error}</span>
            </div>
            <div className="tw:flex tw:items-center tw:gap-3">
              <button 
                onClick={onRetry} 
                disabled={loading}
                className="directory-button tw:rounded-lg tw:bg-red-600 tw:text-white tw:px-3 tw:py-1.5 tw:font-semibold tw:hover:bg-red-700 tw:transition-colors tw:cursor-pointer">
                Try again
              </button>
              {selected && (
                <button 
                  type="button" 
                  onClick={onBack}
                  className="tw:text-xs tw:font-semibold tw:text-red-700 tw:underline tw:cursor-pointer">
                  Back to list
                </button>
              )}
            </div>
          </div>
        )}

        {/* Customer Directory Table */}
        {!loading && !error && !selected && list && (
          <>
            <div className="directory-count tw:text-xs tw:font-medium tw:text-slate-500 tw:mb-3">
              {list.total} {list.total === 1 ? 'customer' : 'customers'}{searchTerm && ' matching your search'}
            </div>

            <div className="directory-table-wrap tw:relative tw:overflow-x-auto tw:w-full tw:rounded-2xl tw:border tw:border-slate-200/80 tw:bg-white tw:shadow-2xs">
              <table className="directory-table tw:w-full tw:border-collapse tw:text-left tw:text-xs">
                  <thead>
                    <tr className="tw:border-b tw:border-slate-100 tw:bg-slate-50/70 tw:text-[11px] tw:font-bold tw:uppercase tw:tracking-wider tw:text-slate-500">
                      <th className="tw:px-5 tw:py-3.5">Customer</th>
                      <th className="tw:px-5 tw:py-3.5">Customer code</th>
                      <th className="tw:px-5 tw:py-3.5">Email</th>
                      <th className="tw:px-5 tw:py-3.5">Phone</th>
                      <th className="tw:px-5 tw:py-3.5">Status</th>
                      <th className="tw:px-5 tw:py-3.5 tw:text-right"><span className="tw:sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody className="tw:divide-y tw:divide-slate-100">
                    {list.items.map(c => (
                      <tr key={c.id} className="tw:hover:bg-slate-50/60 tw:transition-colors">
                        <td className="tw:px-5 tw:py-3.5">
                          <div className="directory-customer-name tw:flex tw:items-center tw:gap-3 tw:whitespace-nowrap">
                            <span className="directory-avatar tw:grid tw:place-items-center tw:rounded-full tw:w-8 tw:h-8 tw:bg-gradient-to-tr tw:from-blue-600 tw:to-indigo-500 tw:text-white tw:font-bold tw:text-xs tw:shrink-0 tw:shadow-2xs">
                              {c.fullName.slice(0, 1)}
                            </span>
                            <strong className="tw:font-bold tw:text-slate-900">{c.fullName}</strong>
                          </div>
                        </td>
                        <td className="tw:px-5 tw:py-3.5 tw:font-mono tw:text-slate-600">{c.accountCode}</td>
                        <td className="tw:px-5 tw:py-3.5 tw:text-slate-600">{c.email}</td>
                        <td className="tw:px-5 tw:py-3.5 tw:text-slate-600">{c.phone || 'Not provided'}</td>
                        <td className="tw:px-5 tw:py-3.5">
                          <span className={'directory-status tw:inline-flex tw:items-center tw:px-2.5 tw:py-0.5 tw:rounded-full tw:text-[11px] tw:font-semibold ' + (c.status === 'ACTIVE' ? 'tw:bg-emerald-50 tw:text-emerald-700 tw:border tw:border-emerald-200/60 is-active' : 'tw:bg-amber-50 tw:text-amber-700 tw:border tw:border-amber-200/60')}>
                            {c.status === 'ACTIVE' ? 'Active' : 'Locked'}
                          </span>
                        </td>
                        <td className="tw:px-5 tw:py-3.5 tw:text-right">
                          <button 
                            onClick={() => onSelect(c.id)}
                            aria-label={`View profile ${c.fullName}`}
                            className="directory-button tw:inline-flex tw:items-center tw:gap-1.5 tw:rounded-xl tw:border tw:border-slate-200 tw:bg-white tw:px-3 tw:py-1.5 tw:text-xs tw:font-semibold tw:text-blue-600 tw:shadow-2xs tw:hover:bg-blue-50 tw:hover:border-blue-200 tw:transition-all tw:cursor-pointer">
                            View details →
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              {list.items.length === 0 && (
                <div className="reference-empty tw:py-12 tw:text-center tw:text-xs tw:text-slate-500">
                  {searchTerm && list.total === 0 
                    ? 'No customers match your search.' 
                    : list.total === 0 
                      ? 'No customers are currently assigned to you.' 
                      : 'No customers on this page.'}
                </div>
              )}
            </div>

            {/* Pagination */}
            <nav aria-label="Customer pagination" className="directory-pagination tw:flex tw:items-center tw:justify-between tw:mt-4 tw:text-xs tw:text-slate-500">
              <span>
                Page {page} of {Math.max(1, Math.ceil(list.total / list.pageSize))}
              </span>
              <div className="tw:flex tw:items-center tw:gap-2">
                <button 
                  onClick={() => onPage(page - 1)}
                  disabled={page <= 1}
                  className="directory-button tw:inline-flex tw:items-center tw:rounded-xl tw:border tw:border-slate-200 tw:bg-white tw:px-3 tw:py-1.5 tw:font-semibold tw:text-slate-700 tw:shadow-2xs tw:hover:bg-slate-50 tw:disabled:opacity-40 tw:disabled:cursor-not-allowed tw:transition-colors tw:cursor-pointer">
                  Previous
                </button>
                <button 
                  onClick={() => onPage(page + 1)}
                  disabled={page * list.pageSize >= list.total}
                  className="directory-button tw:inline-flex tw:items-center tw:rounded-xl tw:border tw:border-slate-200 tw:bg-white tw:px-3 tw:py-1.5 tw:font-semibold tw:text-slate-700 tw:shadow-2xs tw:hover:bg-slate-50 tw:disabled:opacity-40 tw:disabled:cursor-not-allowed tw:transition-colors tw:cursor-pointer">
                  Next
                </button>
              </div>
            </nav>
          </>
        )}

        {/* Customer Detail Dossier View */}
        {!loading && !error && selected && detail && detail.id === selected && (
          <div className="directory-profile tw:grid tw:grid-cols-1 tw:lg:grid-cols-3 tw:gap-6 tw:items-start policies-first">
            {/* Policies section (Takes 2 cols) */}
            <div className="tw:lg:col-span-2">
              <StaffCustomerPolicies customerId={detail.id} />
            </div>

            {/* Personal Information Card (Takes 1 col) */}
            <aside className="directory-profile-card customer-personal tw:rounded-2xl tw:border tw:border-slate-200/80 tw:bg-white tw:p-6 tw:shadow-2xs">
              <div className="tw:flex tw:items-center tw:justify-between tw:mb-4">
                <h2 className="tw:text-xs tw:font-bold tw:uppercase tw:tracking-wider tw:text-slate-400">
                  Personal information
                </h2>
                <span className="tw:inline-flex tw:items-center tw:px-2 tw:py-0.5 tw:rounded-md tw:bg-slate-100 tw:text-[10px] tw:font-mono tw:text-slate-600">
                  ID: {detail.accountCode}
                </span>
              </div>

              <dl className="tw:space-y-3.5 tw:text-xs">
                {[
                  ['Customer code', detail.accountCode],
                  ['Year of birth', detail.birthYear?.toString()],
                  ['Province / city', detail.provinceCity]
                ].map(([k, v]) => (
                  <div key={k} className="tw:border-b tw:border-slate-100 tw:pb-3 tw:last:border-0 tw:last:pb-0">
                    <dt className="tw:text-[11px] tw:font-medium tw:text-slate-400 tw:mb-0.5">{k}</dt>
                    <dd className="tw:font-semibold tw:text-slate-900 tw:break-words">{v || 'Not provided'}</dd>
                  </div>
                ))}
                {!blocked && <ContactFields key={`${actorId}:${detail.id}:${contactRevision}`} customer={detail} csrfToken={csrfToken} onDenied={onDenied} />}
              </dl>
              <nav aria-label="Customer support" className="tw:mt-5 tw:flex tw:flex-wrap tw:gap-2 tw:border-t tw:border-slate-200 tw:pt-4">
                <Link href={`/staff/inbox?customerId=${encodeURIComponent(detail.id)}`} prefetch={false}
                  className="tw:inline-flex tw:items-center tw:rounded-lg tw:border tw:border-slate-300 tw:px-3 tw:py-2 tw:text-xs tw:font-semibold tw:text-blue-700 tw:no-underline tw:hover:bg-blue-50 tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-blue-600">
                  Conversations
                </Link>
                <Link href={`/staff/tickets?customerId=${encodeURIComponent(detail.id)}`} prefetch={false}
                  className="tw:inline-flex tw:items-center tw:rounded-lg tw:border tw:border-slate-300 tw:px-3 tw:py-2 tw:text-xs tw:font-semibold tw:text-blue-700 tw:no-underline tw:hover:bg-blue-50 tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-blue-600">
                  Tickets
                </Link>
              </nav>
            </aside>
          </div>
        )}
      </div>
    </section>
  );
}

function ContactFields({ customer, csrfToken, onDenied }: { customer: StaffCustomer; csrfToken: string; onDenied: (status: number) => void }) {
  return <>{(['email', 'phone'] as const).map(field => <ContactField key={field} customerId={customer.id} field={field} masked={customer[field]} csrfToken={csrfToken} onDenied={onDenied} />)}</>;
}

function ContactField({ customerId, field, masked, csrfToken, onDenied }: {
  customerId: string; field: 'email' | 'phone'; masked: string | null; csrfToken: string; onDenied: (status: number) => void;
}) {
  const [revealed, setRevealed] = useState<{ value: string | null } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => { active.current?.abort(); active.current = null; }, []);
  function hide() {
    active.current?.abort(); active.current = null;
    setRevealed(null); setPending(false); setError('');
  }
  async function show() {
    const controller = new AbortController(); active.current?.abort(); active.current = controller;
    setPending(true); setError('');
    try {
      const result = await revealCustomerContact(customerId, field, csrfToken, AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]));
      if (active.current !== controller || controller.signal.aborted) return;
      if (result.customerId !== customerId || result.field !== field) throw new Error('Unexpected contact response');
      setRevealed({ value: result.value });
    } catch (cause) {
      if (active.current !== controller || controller.signal.aborted) return;
      setRevealed(null);
      if (cause instanceof AuthError && [401, 403, 404].includes(cause.status)) onDenied(cause.status);
      else setError('Unable to show contact. Try again.');
    } finally {
      if (active.current === controller) { active.current = null; setPending(false); }
    }
  }
  async function copy() {
    if (!revealed?.value) return;
    try {
      await navigator.clipboard.writeText(revealed.value);
    } catch {
      setError('Unable to copy contact.');
    }
  }
  const label = field === 'email' ? 'Email' : 'Phone';
  const value = revealed ? revealed.value : masked;
  return <div className="tw:border-b tw:border-slate-100 tw:pb-3">
    <dt className="tw:text-[11px] tw:font-medium tw:text-slate-400">{label}</dt>
    <dd className="tw:font-semibold tw:text-slate-900 tw:break-words">
      {revealed?.value ? <a className="tw:text-blue-700 tw:underline" href={`${field === 'email' ? 'mailto:' : 'tel:'}${revealed.value}`}>{value}</a> : <span>{value || 'Not provided'}</span>}
      <button type="button" aria-label={`${revealed || pending ? 'Hide' : 'Show'} ${label.toLowerCase()}`} aria-expanded={Boolean(revealed)}
        onClick={revealed || pending ? hide : () => void show()}
        className="tw:ml-3 tw:rounded tw:px-2 tw:py-1 tw:text-blue-700 tw:underline tw:focus-visible:outline-2">
        {pending ? 'Cancel' : revealed ? 'Hide' : 'Show'}
      </button>
      {revealed?.value && <button type="button" aria-label={`Copy ${label.toLowerCase()}`}
        className="tw:ml-2 tw:rounded tw:px-2 tw:py-1 tw:text-blue-700 tw:underline tw:focus-visible:outline-2"
        onClick={() => void copy()}>Copy</button>}
      {pending && <span role="status" className="tw:ml-2">Loading contact...</span>}
      {error && <span role="alert" className="tw:block tw:text-red-700">{error}</span>}
    </dd>
  </div>;
}
