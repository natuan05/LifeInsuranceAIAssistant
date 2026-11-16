'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { lookupPolicies } from '@/lib/policy-api';
import { PolicyStatus, StaffPolicyDetail, usePolicyRead } from './staff-policies';

const button = 'tw:inline-flex tw:items-center tw:rounded-xl tw:border tw:border-slate-200 tw:bg-white tw:px-3 tw:py-1.5 tw:text-xs tw:font-semibold tw:text-slate-700 tw:shadow-2xs tw:hover:bg-slate-50 tw:focus-visible:outline-2 tw:focus-visible:outline-blue-600 tw:disabled:opacity-40 tw:disabled:cursor-not-allowed tw:transition-colors tw:cursor-pointer';
const statuses = ['', 'ACTIVE', 'LAPSED', 'MATURED', 'PENDING'];

export function StaffPolicyLookup() {
  const [resultsCollapsed, setResultsCollapsed] = useState(false);
  const search = useSearchParams();
  const params = useParams<{ policyId?: string }>();
  const selected = params.policyId;
  const term = (search.get('search') ?? '').trim();
  const rawPage = search.get('page') ?? '1';
  const page = /^\d+$/.test(rawPage) && Number(rawPage) > 0 && Number(rawPage) <= 100000 ? Number(rawPage) : 1;
  const status = statuses.includes(search.get('status') ?? '') ? search.get('status') ?? '' : '';
  const input = useRef<HTMLInputElement>(null);
  const inputEditing = useRef(false);
  useEffect(() => {
    const currentTerm = (new URLSearchParams(window.location.search).get('search') ?? '').trim();
    if (input.current && !inputEditing.current && currentTerm === term) input.current.value = term;
  }, [term]);
  useEffect(() => {
    const restoreSearch = () => {
      inputEditing.current = false;
      if (input.current) input.current.value = (new URLSearchParams(window.location.search).get('search') ?? '').trim();
    };
    window.addEventListener('popstate', restoreSearch);
    return () => window.removeEventListener('popstate', restoreSearch);
  }, []);
  const state = usePolicyRead(JSON.stringify([page, term, status]), signal => lookupPolicies(page, term, status, signal));

  function currentParams() {
    if (typeof window === 'undefined') return new URLSearchParams();
    return new URLSearchParams(window.location.search);
  }

  function url(id?: string, nextPage?: number, nextTerm?: string, nextStatus?: string) {
    const current = currentParams();
    const effectiveTerm = nextTerm !== undefined ? nextTerm : (current.get('search') ?? term);
    const effectiveStatus = nextStatus !== undefined ? nextStatus : (current.get('status') ?? status);
    const effectivePage = nextPage !== undefined ? nextPage : (Number(current.get('page')) || page);

    const query = new URLSearchParams();
    if (effectiveTerm.trim()) query.set('search', effectiveTerm.trim());
    if (effectiveStatus && statuses.includes(effectiveStatus)) query.set('status', effectiveStatus);
    if (effectivePage > 1) query.set('page', String(effectivePage));
    return `/staff/policies${id ? '/' + encodeURIComponent(id) : ''}${query.size ? '?' + query : ''}`;
  }

  function filter(nextPage: number, nextTerm?: string, nextStatus?: string) {
    if (nextTerm !== undefined) inputEditing.current = false;
    const target = url(selected, nextPage, nextTerm, nextStatus);
    if (target === window.location.pathname + window.location.search) state.retry();
    else window.history.pushState(null, '', target);
  }

  return (
    <section aria-label="Policy Lookup" className="tw:flex tw:min-h-0 tw:min-w-0 tw:flex-1 tw:flex-col tw:bg-slate-50 tw:h-full">
      {/* Top Header */}
      <header className="tw:flex tw:shrink-0 tw:items-center tw:justify-between tw:gap-3 tw:border-b tw:border-slate-200/80 tw:bg-white tw:px-6 tw:py-3.5 tw:shadow-2xs">
        <div>
          <h1 className="tw:text-lg tw:font-bold tw:text-slate-900">Policy Lookup</h1>
          <p className="tw:mt-0.5 tw:text-xs tw:text-slate-500">
            Search policies for customers currently assigned to you.
          </p>
        </div>
      </header>

      {/* Main 2-Column Explorer */}
      <div className="tw:flex tw:min-h-0 tw:min-w-0 tw:flex-1 tw:max-[1000px]:flex-col tw:overflow-hidden">
        {/* Toggle Expand Rail (When collapsed) */}
        {resultsCollapsed && (
          <div className="tw:flex tw:w-12 tw:shrink-0 tw:items-start tw:justify-center tw:border-r tw:border-slate-200/80 tw:bg-white tw:pt-4 tw:max-[1000px]:hidden">
            <button 
              type="button" 
              aria-label={resultsCollapsed ? 'Expand policy results' : 'Collapse policy results'} 
              title={resultsCollapsed ? 'Expand policy results' : 'Collapse policy results'} 
              aria-controls="policy-search-results" 
              aria-expanded={!resultsCollapsed} 
              className="tw:inline-flex tw:h-8 tw:w-8 tw:shrink-0 tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-lg tw:border tw:border-slate-200 tw:bg-white tw:text-slate-500 tw:hover:text-slate-800 tw:hover:bg-slate-50 tw:shadow-2xs tw:focus-visible:outline-2 tw:focus-visible:outline-blue-600 tw:max-[1000px]:hidden tw:transition-all" 
              onClick={() => setResultsCollapsed(value => !value)}>
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="16" rx="2"/>
                <path d="M9 4v16"/>
                <path d={resultsCollapsed ? 'm13 9 3 3-3 3' : 'm16 9-3 3 3 3'}/>
              </svg>
            </button>
          </div>
        )}

        {/* Search Results Sidebar */}
        <aside 
          id="policy-search-results" 
          aria-label="Policy search and results" 
          className={`tw:flex tw:w-[380px] tw:shrink-0 tw:flex-col tw:overflow-y-auto tw:border-r tw:border-slate-200/80 tw:bg-white tw:max-[1000px]:w-full ${resultsCollapsed ? 'tw:min-[1001px]:hidden' : ''} ${selected ? 'tw:max-[1000px]:hidden' : ''}`}>
          
          <form 
            role="search" 
            aria-label="Search assigned policies" 
            className="tw:p-5 tw:border-b tw:border-slate-100" 
            onSubmit={event => { 
              event.preventDefault(); 
              filter(1, String(new FormData(event.currentTarget).get('search') ?? '').trim()); 
            }}>
            <div className="tw:mb-3 tw:flex tw:items-center tw:justify-between tw:h-7">
              <label htmlFor="policy-search" className="tw:text-xs tw:font-bold tw:text-slate-700 tw:leading-none tw:m-0">Search policies</label>
              <button 
                type="button" 
                aria-label={resultsCollapsed ? 'Expand policy results' : 'Collapse policy results'} 
                title={resultsCollapsed ? 'Expand policy results' : 'Collapse policy results'} 
                aria-controls="policy-search-results" 
                aria-expanded={!resultsCollapsed} 
                className="tw:inline-flex tw:h-7 tw:w-7 tw:shrink-0 tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-lg tw:border tw:border-slate-200 tw:bg-white tw:text-slate-400 tw:hover:text-slate-700 tw:hover:bg-slate-50 tw:shadow-2xs tw:focus-visible:outline-2 tw:focus-visible:outline-blue-600 tw:max-[1000px]:hidden tw:transition-all" 
                onClick={() => setResultsCollapsed(value => !value)}>
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="16" rx="2"/>
                  <path d="M9 4v16"/>
                  <path d={resultsCollapsed ? 'm13 9 3 3-3 3' : 'm16 9-3 3 3 3'}/>
                </svg>
              </button>
            </div>
            
            <div className="tw:relative tw:mb-3">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="tw:absolute tw:left-3 tw:top-1/2 tw:-translate-y-1/2 tw:text-slate-400 tw:pointer-events-none">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input 
                ref={input} 
                id="policy-search" 
                name="search" 
                type="search" 
                defaultValue={term} 
                maxLength={100} 
                placeholder="Policy, customer or product" 
                onChange={() => { inputEditing.current = true; }}
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    filter(1, event.currentTarget.value.trim());
                  }
                }}
                className="tw:w-full tw:pl-9 tw:pr-3 tw:py-2 tw:rounded-xl tw:border tw:border-slate-200 tw:bg-slate-50/50 tw:text-xs tw:text-slate-900 tw:placeholder:text-slate-400 tw:focus:bg-white tw:focus:outline-hidden tw:focus:border-blue-500 tw:focus:ring-2 tw:focus:ring-blue-100 tw:transition-all" 
              />
              <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
            </div>

            <label htmlFor="policy-status" className="tw:mb-1.5 tw:block tw:text-xs tw:font-semibold tw:text-slate-700">Status</label>
            <select 
              id="policy-status" 
              value={status} 
              onChange={event => filter(1, undefined, event.target.value)} 
              className="tw:w-full tw:rounded-xl tw:border tw:border-slate-200 tw:bg-slate-50/50 tw:px-3 tw:py-2 tw:text-xs tw:text-slate-900 tw:focus:bg-white tw:focus:outline-hidden tw:focus:border-blue-500 tw:focus:ring-2 tw:focus:ring-blue-100 tw:transition-all">
              {statuses.map(value => (
                <option key={value} value={value}>
                  {value ? value[0] + value.slice(1).toLowerCase() : 'All statuses'}
                </option>
              ))}
            </select>
          </form>

          {/* Results List */}
          <div aria-busy={state.loading || state.refreshing} className="tw:min-h-0 tw:flex-1">
            {state.loading && (
              <div role="status" className="tw:py-12 tw:text-center tw:text-xs tw:text-slate-500">
                <div className="tw:inline-block tw:w-4 tw:h-4 tw:border-2 tw:border-blue-600 tw:border-t-transparent tw:rounded-full tw:animate-spin tw:mb-2"/>
                <p>Loading policies…</p>
              </div>
            )}
            
            {state.error && (
              <div role="alert" className="tw:p-5 tw:text-xs tw:text-red-700 tw:bg-red-50/80 tw:m-4 tw:rounded-2xl tw:border tw:border-red-200">
                <p className="tw:font-medium">{state.error}</p>
                <button type="button" className={`${button} tw:mt-3!`} onClick={state.retry}>
                  Try again
                </button>
              </div>
            )}

            {state.data && (
              <>
                <div className="tw:px-5 tw:py-3 tw:text-[11px] tw:font-bold tw:uppercase tw:tracking-wider tw:text-slate-400 tw:border-b tw:border-slate-100 tw:bg-slate-50/40">
                  {state.data.total} {state.data.total === 1 ? 'policy' : 'policies'} found
                </div>
                
                <ul className="tw:m-0 tw:list-none tw:p-0 tw:divide-y tw:divide-slate-100">
                  {state.data.items.map(policy => (
                    <li key={policy.id}>
                      <Link 
                        href={url(policy.id)} 
                        aria-current={selected === policy.id ? 'page' : undefined} 
                        className={`tw:block tw:px-5 tw:py-4 tw:text-slate-900 tw:no-underline tw:transition-all ${
                          selected === policy.id 
                            ? 'tw:bg-blue-50/90 tw:border-l-4 tw:border-l-blue-600' 
                            : 'tw:hover:bg-slate-50/80'
                        }`}>
                        <div className="tw:flex tw:items-center tw:justify-between tw:gap-2">
                          <span className="tw:font-mono tw:text-xs tw:font-bold tw:text-blue-700">
                            {policy.policyNumber}
                          </span>
                          <PolicyStatus status={policy.status} />
                        </div>
                        <p className="tw:mt-1.5 tw:text-xs tw:font-medium tw:text-slate-800 tw:truncate">
                          {policy.customer.fullName} · <span className="tw:font-mono tw:text-slate-500">{policy.customer.accountCode}</span>
                        </p>
                        <p className="tw:mt-1 tw:text-[11px] tw:text-slate-500 tw:truncate">
                          {policy.product.name}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>

                {!state.data.items.length && (
                  <div className="tw:p-8 tw:text-center tw:text-xs tw:text-slate-500">
                    {state.data.total ? 'No policies on this page.' : term || status ? 'No policies match these filters.' : 'No policies are assigned to you.'}
                  </div>
                )}

                <nav aria-label="Policy search pagination" className="tw:flex tw:items-center tw:justify-between tw:gap-2 tw:p-4 tw:border-t tw:border-slate-100 tw:text-xs tw:text-slate-500">
                  <button type="button" className={button} disabled={page <= 1} onClick={() => filter(page - 1)}>
                    Previous
                  </button>
                  <span className="tw:font-medium">
                    Page {page} of {Math.max(1, Math.ceil(state.data.total / state.data.pageSize))}
                  </span>
                  <button type="button" className={button} disabled={page * state.data.pageSize >= state.data.total} onClick={() => filter(page + 1)}>
                    Next
                  </button>
                </nav>
              </>
            )}
          </div>
        </aside>

        {/* Right Detail Pane */}
        <div className={`tw:flex tw:min-h-0 tw:min-w-0 tw:flex-1 tw:flex-col tw:overflow-y-auto ${!selected ? 'tw:max-[1000px]:hidden' : ''}`}>
          {selected ? (
            <>
              <Link href={url()} className="tw:hidden tw:border-b tw:border-slate-200 tw:bg-white tw:px-6 tw:py-3 tw:text-xs tw:font-semibold tw:text-blue-600 tw:no-underline tw:max-[1000px]:block">
                ‹ Back to search results
              </Link>
              <StaffPolicyDetail policyId={selected} lookup />
            </>
          ) : (
            <div className="tw:flex tw:flex-1 tw:flex-col tw:items-center tw:justify-center tw:p-12 tw:text-center tw:bg-slate-50/50">
              <div className="tw:w-16 tw:h-16 tw:rounded-3xl tw:bg-blue-50 tw:border tw:border-blue-200/60 tw:text-blue-600 tw:grid tw:place-items-center tw:mb-4 tw:shadow-xs">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              </div>
              <h2 className="tw:text-base tw:font-bold tw:text-slate-900">Select an insurance policy</h2>
              <p className="tw:mt-1 tw:max-w-sm tw:text-xs tw:leading-relaxed tw:text-slate-500">
                Choose a result from the search panel on the left to inspect its signed contract PDF, coverage metrics, and endorsed terms.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
