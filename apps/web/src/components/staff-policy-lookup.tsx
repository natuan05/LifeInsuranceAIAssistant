'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { lookupPolicies } from '@/lib/policy-api';
import { PolicyStatus, StaffPolicyDetail, usePolicyRead } from './staff-policies';

const button = 'tw:cursor-pointer tw:rounded-lg tw:border tw:border-solid tw:border-slate-300 tw:bg-white tw:px-3! tw:py-2! tw:text-xs tw:text-slate-700 tw:hover:bg-slate-50 tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-blue-600 tw:disabled:cursor-default tw:disabled:opacity-50';
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
  useEffect(() => { if (input.current) input.current.value = term; }, [term]);
  const state = usePolicyRead(JSON.stringify([page, term, status]), signal => lookupPolicies(page, term, status, signal));
  function url(id?: string, nextPage = page, nextTerm = term, nextStatus = status) {
    const query = new URLSearchParams();
    if (nextTerm) query.set('search', nextTerm);
    if (nextStatus) query.set('status', nextStatus);
    if (nextPage > 1) query.set('page', String(nextPage));
    return `/staff/policies${id ? '/' + encodeURIComponent(id) : ''}${query.size ? '?' + query : ''}`;
  }
  function filter(nextPage: number, nextTerm = term, nextStatus = status) {
    const target = url(selected, nextPage, nextTerm, nextStatus);
    if (target === window.location.pathname + window.location.search) state.retry();
    else window.history.pushState(null, '', target);
  }
  return <section aria-label="Policy Lookup" className="tw:flex tw:min-h-0 tw:min-w-0 tw:flex-1 tw:flex-col tw:bg-slate-50">
    <header className="tw:flex tw:shrink-0 tw:items-center tw:justify-between tw:gap-4 tw:border-0 tw:border-b tw:border-solid tw:border-slate-200 tw:bg-white tw:px-6 tw:py-5"><div><h1 className="tw:text-xl tw:font-semibold">Policy Lookup</h1><p className="tw:mt-1 tw:text-xs tw:leading-5 tw:text-slate-600">Search policies for customers currently assigned to you.</p></div></header>
    <div className="tw:flex tw:min-h-0 tw:min-w-0 tw:flex-1 tw:max-[1000px]:flex-col">
      {resultsCollapsed && <div className="tw:flex tw:w-12 tw:shrink-0 tw:items-start tw:justify-center tw:border-0 tw:border-r tw:border-solid tw:border-slate-200 tw:bg-white tw:pt-3 tw:max-[1000px]:hidden"><button type="button" aria-label={resultsCollapsed ? 'Expand policy results' : 'Collapse policy results'} title={resultsCollapsed ? 'Expand policy results' : 'Collapse policy results'} aria-controls="policy-search-results" aria-expanded={!resultsCollapsed} className="tw:inline-flex tw:h-8 tw:w-8! tw:shrink-0 tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-md! tw:text-slate-600 tw:hover:bg-slate-100! tw:focus-visible:outline-2 tw:focus-visible:outline-blue-600 tw:max-[1000px]:hidden" onClick={() => setResultsCollapsed(value => !value)}><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/><path d={resultsCollapsed ? 'm13 9 3 3-3 3' : 'm16 9-3 3 3 3'}/></svg></button></div>}
      <aside id="policy-search-results" aria-label="Policy search and results" className={`tw:flex tw:w-[360px] tw:shrink-0 tw:flex-col tw:overflow-auto tw:border-0 tw:border-r tw:border-solid tw:border-slate-200 tw:bg-white tw:max-[1000px]:w-full ${resultsCollapsed ? 'tw:min-[1001px]:hidden' : ''} ${selected ? 'tw:max-[1000px]:hidden' : ''}`}>
        <form role="search" aria-label="Search assigned policies" className="tw:p-4" onSubmit={event => { event.preventDefault(); filter(1, String(new FormData(event.currentTarget).get('search') ?? '').trim()); }}>
          <div className="tw:mb-2 tw:flex tw:items-center tw:justify-between tw:gap-2"><label htmlFor="policy-search" className="tw:text-xs tw:font-medium">Search policies</label><button type="button" aria-label={resultsCollapsed ? 'Expand policy results' : 'Collapse policy results'} title={resultsCollapsed ? 'Expand policy results' : 'Collapse policy results'} aria-controls="policy-search-results" aria-expanded={!resultsCollapsed} className="tw:inline-flex tw:h-8 tw:w-8! tw:shrink-0 tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-md! tw:text-slate-600 tw:hover:bg-slate-100! tw:focus-visible:outline-2 tw:focus-visible:outline-blue-600 tw:max-[1000px]:hidden" onClick={() => setResultsCollapsed(value => !value)}><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/><path d={resultsCollapsed ? 'm13 9 3 3-3 3' : 'm16 9-3 3 3 3'}/></svg></button></div>
          <input ref={input} id="policy-search" name="search" type="search" defaultValue={term} maxLength={100} placeholder="Policy, customer or product" className="tw:box-border tw:w-full tw:rounded-lg tw:border tw:border-solid tw:border-slate-300 tw:bg-white tw:px-3 tw:py-2.5 tw:font-[inherit] tw:text-sm tw:focus-visible:outline-2 tw:focus-visible:outline-blue-600" />
          <div className="tw:my-3 tw:flex tw:gap-2"><button type="submit" className={`${button} tw:bg-blue-600! tw:text-white! tw:hover:bg-blue-700!`}>Search</button><button type="button" className={button} onClick={() => { if (input.current) { input.current.value = ''; input.current.focus(); } filter(1, ''); }}>Clear search</button></div>
          <label htmlFor="policy-status" className="tw:mb-2 tw:block tw:text-xs tw:font-medium">Status</label>
          <select id="policy-status" value={status} onChange={event => filter(1, term, event.target.value)} className="tw:w-full tw:rounded-lg tw:border tw:border-solid tw:border-slate-300 tw:bg-white tw:px-3 tw:py-2 tw:font-[inherit] tw:text-sm tw:focus-visible:outline-2 tw:focus-visible:outline-blue-600">{statuses.map(value => <option key={value} value={value}>{value ? value[0] + value.slice(1).toLowerCase() : 'All statuses'}</option>)}</select>
        </form>
        <div aria-busy={state.loading} className="tw:min-h-0 tw:flex-1 tw:border-0 tw:border-t tw:border-solid tw:border-slate-200">
          {state.loading && <p role="status" className="tw:p-5 tw:text-sm tw:text-slate-600">Loading policies…</p>}
          {state.error && <div role="alert" className="tw:p-5 tw:text-sm tw:text-red-700"><p>{state.error}</p><button type="button" className={`${button} tw:mt-3!`} onClick={state.retry}>Try again</button></div>}
          {state.data && <><p className="tw:px-4 tw:py-3 tw:text-xs tw:text-slate-600">{state.data.total} {state.data.total === 1 ? 'policy' : 'policies'}</p><ul className="tw:m-0 tw:list-none tw:p-0">{state.data.items.map(policy => <li key={policy.id}><Link href={url(policy.id)} aria-current={selected === policy.id ? 'page' : undefined} className={`tw:block tw:border-0 tw:border-b tw:border-solid tw:border-slate-100 tw:px-4 tw:py-4 tw:text-slate-900 tw:no-underline tw:hover:bg-blue-50 tw:focus-visible:outline-2 tw:focus-visible:outline-blue-600 ${selected === policy.id ? 'tw:bg-blue-50' : ''}`}><div className="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-2"><span className="tw:wrap-anywhere tw:text-sm tw:font-semibold">{policy.policyNumber}</span><PolicyStatus status={policy.status} /></div><p className="tw:mt-2 tw:wrap-anywhere tw:text-xs tw:leading-5">{policy.customer.fullName} · {policy.customer.accountCode}</p><p className="tw:mt-1 tw:wrap-anywhere tw:text-xs tw:leading-5 tw:text-slate-600">{policy.product.name}</p></Link></li>)}</ul>
            {!state.data.items.length && <p className="tw:p-5 tw:text-sm tw:leading-6 tw:text-slate-600">{state.data.total ? 'No policies on this page.' : term || status ? 'No policies match these filters.' : 'No policies are assigned to you.'}</p>}
            <nav aria-label="Policy search pagination" className="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-2 tw:p-4 tw:text-xs tw:text-slate-600"><button type="button" className={button} disabled={page <= 1} onClick={() => filter(page - 1)}>Previous</button><span>Page {page} of {Math.max(1, Math.ceil(state.data.total / state.data.pageSize))}</span><button type="button" className={button} disabled={page * state.data.pageSize >= state.data.total} onClick={() => filter(page + 1)}>Next</button></nav>
          </>}
        </div>
      </aside>
      <div className={`tw:flex tw:min-h-0 tw:min-w-0 tw:flex-1 tw:flex-col ${!selected ? 'tw:max-[1000px]:hidden' : ''}`}>
        {selected ? <><Link href={url()} className="tw:hidden tw:border-0 tw:border-b tw:border-solid tw:border-slate-200 tw:bg-white tw:px-5 tw:py-3 tw:text-sm tw:text-blue-700 tw:no-underline tw:max-[1000px]:block">Back to results</Link><StaffPolicyDetail policyId={selected} lookup /></> : <div className="tw:flex tw:flex-1 tw:flex-col tw:items-center tw:justify-center tw:p-8 tw:text-center"><h2 className="tw:text-base tw:font-semibold">Select a policy</h2><p className="tw:mt-2 tw:max-w-sm tw:text-sm tw:leading-6 tw:text-slate-600">Choose a result to read its original PDF, coverage and supporting documents.</p></div>}
      </div>
    </div>
  </section>;
}
