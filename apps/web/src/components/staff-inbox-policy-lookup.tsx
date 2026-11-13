'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { customerPolicies, policyDate, policyMoney, type Policy, type PolicyList } from '@/lib/policy-api';
import { useAuthorizedRead } from './use-authorized-read';

interface StaffInboxPolicyLookupProps {
  customerId: string;
  customerName?: string;
}

const statusConfig: Record<Policy['status'], { label: string; badgeClass: string; dotClass: string }> = {
  ACTIVE: {
    label: 'Active',
    badgeClass: 'tw:bg-emerald-50 tw:text-emerald-700 tw:border-emerald-200/60',
    dotClass: 'tw:bg-emerald-500',
  },
  PENDING: {
    label: 'Pending',
    badgeClass: 'tw:bg-amber-50 tw:text-amber-700 tw:border-amber-200/60',
    dotClass: 'tw:bg-amber-500',
  },
  LAPSED: {
    label: 'Lapsed',
    badgeClass: 'tw:bg-rose-50 tw:text-rose-700 tw:border-rose-200/60',
    dotClass: 'tw:bg-rose-500',
  },
  MATURED: {
    label: 'Matured',
    badgeClass: 'tw:bg-blue-50 tw:text-blue-700 tw:border-blue-200/60',
    dotClass: 'tw:bg-blue-500',
  },
};

export function StaffInboxPolicyLookup({ customerId }: StaffInboxPolicyLookupProps) {
  const [search, setSearch] = useState('');

  // Fetch policies for the currently active customer (page 1, up to 10 items)
  const state = useAuthorizedRead<PolicyList>(
    `inbox-customer-policies:${customerId}`,
    signal => customerPolicies(customerId, 1, signal),
    false,
  );

  const policies = state.data?.items ?? [];

  // Client-side filtering by policy number, product name, or product code
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return policies;
    return policies.filter(item =>
      item.policyNumber.toLowerCase().includes(term) ||
      item.product.name.toLowerCase().includes(term) ||
      item.product.productCode.toLowerCase().includes(term),
    );
  }, [policies, search]);

  return (
    <div className="tw:space-y-4" aria-label="Customer policy lookup">
      {/* Search Input Bar */}
      <div className="tw:relative">
        <label htmlFor="inbox-policy-lookup-search" className="tw:sr-only">
          Search customer policies
        </label>
        <svg
          aria-hidden="true"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="tw:pointer-events-none tw:absolute tw:left-3 tw:top-1/2 tw:-translate-y-1/2 tw:text-slate-400"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          id="inbox-policy-lookup-search"
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by policy number, product name…"
          className="tw:w-full tw:rounded-xl tw:border tw:border-slate-200 tw:bg-white tw:py-2 tw:pl-9 tw:pr-8 tw:text-xs tw:text-slate-900 tw:placeholder:text-slate-400 tw:shadow-2xs tw:transition-all tw:focus:border-blue-500 tw:focus:outline-hidden tw:focus:ring-2 tw:focus:ring-blue-100"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            aria-label="Clear input"
            className="tw:absolute tw:right-2.5 tw:top-1/2 tw:-translate-y-1/2 tw:cursor-pointer tw:text-slate-400 tw:hover:text-slate-600"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {/* Header with counter */}
      <div className="tw:flex tw:items-center tw:justify-between tw:px-1">
        <span className="tw:text-[10px] tw:font-bold tw:uppercase tw:tracking-wider tw:text-slate-400">
          INSURANCE POLICIES
        </span>
        {state.data && (
          <span className="tw:rounded-full tw:bg-slate-100 tw:px-2 tw:py-0.5 tw:text-[10px] tw:font-semibold tw:text-slate-600">
            {filtered.length} / {state.data.total}
          </span>
        )}
      </div>

      {/* Loading Skeleton State */}
      {state.loading && (
        <div role="status" className="tw:space-y-3 tw:animate-pulse">
          <div className="tw:h-28 tw:rounded-2xl tw:bg-slate-100 tw:border tw:border-slate-200/60" />
          <div className="tw:h-28 tw:rounded-2xl tw:bg-slate-100 tw:border tw:border-slate-200/60" />
          <span className="tw:sr-only">Loading policy list…</span>
        </div>
      )}

      {/* Error State */}
      {state.error && !state.loading && (
        <div role="alert" className="tw:rounded-2xl tw:border tw:border-red-200/80 tw:bg-red-50/60 tw:p-4 tw:text-xs tw:shadow-2xs">
          <p className="tw:font-medium tw:text-red-700 tw:mb-2.5 tw:leading-relaxed">
            {state.error}
          </p>
          <button
            type="button"
            onClick={state.retry}
            className="tw:inline-flex tw:items-center tw:gap-1.5 tw:rounded-xl tw:border tw:border-red-200 tw:bg-white tw:px-3 tw:py-1.5 tw:text-xs tw:font-semibold tw:text-red-700 tw:shadow-2xs tw:hover:bg-red-50 tw:transition-colors tw:cursor-pointer"
          >
            Try again
          </button>
        </div>
      )}

      {/* Empty State: Customer has no policies */}
      {!state.loading && !state.error && policies.length === 0 && (
        <div className="tw:rounded-2xl tw:border tw:border-slate-200/80 tw:bg-white tw:p-5 tw:text-center tw:shadow-2xs">
          <div className="tw:mx-auto tw:mb-2.5 tw:grid tw:h-10 tw:w-10 tw:place-items-center tw:rounded-xl tw:bg-slate-100 tw:text-slate-400">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          </div>
          <p className="tw:text-xs tw:font-semibold tw:text-slate-700 tw:mb-1">
            No policies found
          </p>
          <p className="tw:text-[11px] tw:text-slate-500 tw:leading-relaxed">
            This customer has no active insurance policies registered in the system.
          </p>
        </div>
      )}

      {/* Search Empty State: No policies match query */}
      {!state.loading && !state.error && policies.length > 0 && filtered.length === 0 && (
        <div className="tw:rounded-2xl tw:border tw:border-slate-200/80 tw:bg-white tw:p-5 tw:text-center tw:shadow-2xs">
          <p className="tw:text-xs tw:font-semibold tw:text-slate-700 tw:mb-1">
            No matching policies
          </p>
          <p className="tw:text-[11px] tw:text-slate-500 tw:leading-relaxed tw:mb-2.5">
            No policies matched &ldquo;{search}&rdquo;.
          </p>
          <button
            type="button"
            onClick={() => setSearch('')}
            className="tw:text-xs tw:font-semibold tw:text-blue-600 tw:hover:underline tw:cursor-pointer"
          >
            Clear search filter
          </button>
        </div>
      )}

      {/* Filtered Policy Cards List */}
      {!state.loading && !state.error && filtered.length > 0 && (
        <div className="tw:space-y-3">
          {filtered.map(policy => {
            const config = statusConfig[policy.status] ?? {
              label: policy.status,
              badgeClass: 'tw:bg-slate-100 tw:text-slate-700 tw:border-slate-200',
              dotClass: 'tw:bg-slate-400',
            };

            return (
              <article
                key={policy.id}
                aria-label={`Policy ${policy.policyNumber}`}
                className="tw:rounded-2xl tw:border tw:border-slate-200/80 tw:bg-white tw:p-4 tw:shadow-2xs tw:transition-all tw:hover:border-slate-300"
              >
                {/* Header: Policy Number & Status Badge */}
                <div className="tw:flex tw:items-center tw:justify-between tw:gap-2 tw:mb-2">
                  <span className="tw:font-mono tw:text-xs tw:font-bold tw:text-slate-900">
                    #{policy.policyNumber}
                  </span>
                  <span
                    className={`tw:inline-flex tw:items-center tw:gap-1.5 tw:rounded-full tw:border tw:px-2 tw:py-0.5 tw:text-[10px] tw:font-semibold ${config.badgeClass}`}
                  >
                    <span className={`tw:h-1.5 tw:w-1.5 tw:rounded-full ${config.dotClass}`} />
                    {config.label}
                  </span>
                </div>

                {/* Plan Name */}
                <h4 className="tw:text-xs tw:font-bold tw:text-slate-800 tw:leading-snug tw:mb-3">
                  {policy.product.name}
                </h4>

                {/* Key Policy Parameters */}
                <dl className="tw:grid tw:grid-cols-2 tw:gap-2.5 tw:border-t tw:border-slate-100 tw:pt-2.5 tw:mb-3 tw:text-[11px]">
                  <div>
                    <dt className="tw:text-slate-400 tw:mb-0.5">Sum assured</dt>
                    <dd className="tw:font-bold tw:text-slate-800 tw:m-0">
                      {policyMoney(policy.sumAssured, policy.currency)}
                    </dd>
                  </div>
                  <div>
                    <dt className="tw:text-slate-400 tw:mb-0.5">Periodic premium</dt>
                    <dd className="tw:font-bold tw:text-slate-800 tw:m-0">
                      {policyMoney(policy.premiumAmount, policy.currency)}
                      {policy.paymentFrequency && (
                        <span className="tw:text-[10px] tw:font-normal tw:text-slate-500 tw:block">
                          {policy.paymentFrequency.toLowerCase().replaceAll('_', ' ')}
                        </span>
                      )}
                    </dd>
                  </div>
                  {policy.effectiveDate && (
                    <div className="tw:col-span-2">
                      <dt className="tw:text-slate-400 tw:mb-0.5">Effective date</dt>
                      <dd className="tw:text-slate-700 tw:font-medium tw:m-0">
                        {policyDate(policy.effectiveDate)}
                      </dd>
                    </div>
                  )}
                </dl>

                {/* Action: Open in New Tab */}
                <div className="tw:mt-3">
                  <Link
                    href={`/staff/policies/${policy.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Open policy dossier in new tab"
                    className="tw:w-full tw:inline-flex tw:items-center tw:justify-center tw:gap-2 tw:rounded-xl tw:border tw:border-blue-200/80 tw:bg-blue-50/80 tw:py-2.5 tw:px-3 tw:text-xs tw:font-semibold tw:text-blue-700 tw:hover:bg-blue-600 tw:hover:text-white tw:transition-all tw:no-underline"
                  >
                    <span>Open in new tab</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Global Explorer Link (opens in new tab to preserve chat context) */}
      <div className="tw:pt-2 tw:text-center">
        <Link
          href="/staff/policies"
          target="_blank"
          rel="noopener noreferrer"
          className="tw:inline-flex tw:items-center tw:gap-1 tw:text-[11px] tw:font-medium tw:text-slate-500 tw:hover:text-blue-600 tw:transition-colors tw:no-underline"
        >
          <span>Browse all policies</span>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </Link>
      </div>
    </div>
  );
}
