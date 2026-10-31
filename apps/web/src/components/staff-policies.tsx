'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { AuthError } from '@/lib/auth-api';
import { customerPolicies, policyDetail, policyDocuments, policyMoney, policyDate, type PolicyList, type PolicyDetail, type PolicyDocuments, type Policy } from '@/lib/policy-api';
import { realtimeEvent } from '@/lib/realtime';
import { documentAccess, type PolicyDocument } from '@/lib/policy-api';

const button = 'tw:inline-flex tw:items-center tw:rounded-lg tw:border tw:border-solid tw:border-slate-300 tw:bg-white tw:px-3 tw:py-2 tw:text-xs tw:text-blue-700 tw:hover:bg-blue-50 tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-blue-600 tw:disabled:opacity-50 tw:disabled:cursor-default';
const box = 'tw:rounded-xl tw:border tw:border-solid tw:border-slate-200 tw:bg-white tw:p-5';
const labels: Record<Policy['status'], string> = { ACTIVE: 'Active', LAPSED: 'Lapsed', MATURED: 'Matured', PENDING: 'Pending' };
const kinds = { POLICY: 'Policy', POLICY_DRAFT: 'Draft policy', TERMS: 'Terms and conditions', PRODUCT_GUIDE: 'Product guide', ENDORSEMENT: 'Endorsement' };

function usePolicyRead<T>(key: string, read: (signal: AbortSignal) => Promise<T>): { data?: T; error?: string; loading: boolean; retry: () => void } {
  const router = useRouter();
  const [revision, setRevision] = useState(0);
  const requestKey = JSON.stringify([key, revision]);
  const [state, setState] = useState<{ key: string; data?: T; error?: string; loading: boolean }>({ key: '', loading: true });
  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    window.addEventListener(realtimeEvent, refresh);
    return () => window.removeEventListener(realtimeEvent, refresh);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void read(AbortSignal.any([controller.signal, AbortSignal.timeout(15000)])).then(data => {
      if (!controller.signal.aborted) setState({ key: requestKey, data, loading: false });
    }).catch(error => {
      if (controller.signal.aborted) return;
      if (error instanceof AuthError && error.status === 401) router.replace('/staff/login');
      setState({ key: requestKey, loading: false, error: error instanceof AuthError && [403, 404].includes(error.status)
        ? 'This information is unavailable or is no longer assigned to you.' : 'Unable to load this information. Please try again.' });
    });
    return () => controller.abort();
    // Callers describe every request input with key; avoid restarting requests on render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, router]);
  return { ...(state.key === requestKey ? state : { loading: true }), retry: () => setRevision(value => value + 1) };
}
function ReadState({ loading, error, retry }: { loading: boolean; error?: string; retry: () => void }) {
  if (loading) return <p role="status" className="tw:p-5 tw:text-sm tw:text-slate-600">Loading…</p>;
  if (error) return <div role="alert" className="tw:flex tw:flex-wrap tw:items-center tw:gap-3 tw:p-5 tw:text-sm tw:text-red-700"><p>{error}</p><button type="button" className={button} onClick={retry}>Try again</button></div>;
  return null;
}
function Status({ status }: { status: Policy['status'] }) {
  return <span className={`tw:inline-block tw:rounded-md tw:px-2 tw:py-1 tw:text-xs ${status === 'ACTIVE' ? 'tw:bg-emerald-50 tw:text-emerald-800' : status === 'PENDING' ? 'tw:bg-amber-50 tw:text-amber-800' : 'tw:bg-slate-100 tw:text-slate-700'}`}>{labels[status]}</span>;
}

export function StaffCustomerPolicies({ customerId }: { customerId: string }) {
  const search = useSearchParams();
  const pathname = usePathname();
  const raw = search.get('policyPage') ?? '1';
  const page = /^\d+$/.test(raw) && Number(raw) >= 1 && Number(raw) <= 100000 ? Number(raw) : 1;
  const state = usePolicyRead<PolicyList>(`${customerId}:${page}`, signal => customerPolicies(customerId, page, signal));
  const changePage = (value: number) => {
    const query = new URLSearchParams(search.toString());
    if (value > 1) query.set('policyPage', String(value)); else query.delete('policyPage');
    window.history.pushState(null, '', `${pathname}${query.size ? '?' + query : ''}`);
  };
  function rememberCustomer(policyId: string) {
    try {
      sessionStorage.setItem(`staff-policy-return:${policyId}`, `${pathname}${search.size ? '?' + search.toString() : ''}`);
    } catch { /* Navigation still works when browser storage is disabled. */ }
  }
  return <section className={`${box} tw:min-w-0`} aria-label="Insurance policies">
    <div className="tw:mb-5 tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-2"><h2 className="tw:text-base tw:font-semibold">Insurance policies</h2>{state.data && <span className="tw:text-xs tw:text-slate-600">{state.data.total} policies</span>}</div>
    <ReadState {...state} />
    {state.data && <><div className="tw:overflow-x-auto"><table className="tw:w-full tw:border-collapse tw:text-left tw:text-xs tw:[&_th]:bg-slate-50 tw:[&_th]:p-3 tw:[&_th]:font-medium tw:[&_th]:text-slate-600 tw:[&_td]:border-0 tw:[&_td]:border-t tw:[&_td]:border-solid tw:[&_td]:border-slate-200 tw:[&_td]:p-3"><caption className="tw:sr-only">Policies assigned to this customer</caption><thead><tr><th scope="col">Policy / Plan</th><th scope="col">Status</th><th scope="col">Premium</th><th scope="col">Next due date</th></tr></thead><tbody>{state.data.items.map(policy => <tr key={policy.id}><td><Link className="tw:font-medium tw:text-blue-700 tw:hover:underline" href={`/staff/policies/${policy.id}`} onClick={() => rememberCustomer(policy.id)}>{policy.policyNumber}</Link><p className="tw:mt-1 tw:min-w-36 tw:text-slate-600">{policy.product.name}</p></td><td><Status status={policy.status} /></td><td className="tw:tabular-nums">{policyMoney(policy.premiumAmount, policy.currency)}<p className="tw:mt-1 tw:text-slate-600">{policy.paymentFrequency?.toLowerCase().replaceAll('_', ' ') ?? 'Frequency not provided'}</p></td><td className="tw:whitespace-nowrap">{policyDate(policy.nextDueDate)}</td></tr>)}</tbody></table></div>
      {!state.data.items.length && <p className="tw:py-8 tw:text-center tw:text-sm tw:text-slate-600">{state.data.total ? 'No policies on this page.' : 'This customer has no insurance policies.'}</p>}
      <nav aria-label="Policy pagination" className="tw:mt-5 tw:flex tw:flex-wrap tw:items-center tw:justify-end tw:gap-3 tw:text-xs tw:text-slate-600"><button type="button" className={button} disabled={page <= 1} onClick={() => changePage(page - 1)}>Previous</button><span>Page {page} of {Math.max(1, Math.ceil(state.data.total / state.data.pageSize))}</span><button type="button" className={button} disabled={page * state.data.pageSize >= state.data.total} onClick={() => changePage(page + 1)}>Next</button></nav></>}
  </section>;
}

function Fields({ items }: { items: [string, ReactNode][] }) {
  return <dl className="tw:grid tw:grid-cols-1 tw:gap-x-10 tw:gap-y-5 tw:sm:grid-cols-2 tw:lg:grid-cols-3">{items.map(([label, value]) => <div key={label}><dt className="tw:mb-1 tw:text-xs tw:leading-5 tw:text-slate-600">{label}</dt><dd className="tw:m-0 tw:wrap-anywhere tw:text-sm tw:leading-6 tw:tabular-nums">{value ?? 'Not provided'}</dd></div>)}</dl>;
}

function BenefitAmount({ amount, currency, unit }: { amount: string | null; currency: string | null; unit: string | null }) {
  let period = unit?.trim() ?? '';
  if (currency && (period === currency || period.startsWith(currency + '/'))) period = period.slice(currency.length).replace(/^\/\s*/, '');
  return <>{policyMoney(amount, currency)}{amount !== null && period ? ` / ${period}` : ''}</>;
}

function PolicyInformation({ policy }: { policy: PolicyDetail }) {
  const snapshot = policy.benefitsSnapshot;
  return <details className="tw:group tw:rounded-xl tw:border tw:border-solid tw:border-slate-200 tw:bg-white">
    <summary className="tw:flex tw:cursor-pointer tw:list-none tw:items-center tw:justify-between tw:gap-4 tw:rounded-xl tw:px-5 tw:py-4 tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-blue-600 tw:[&::-webkit-details-marker]:hidden"><span><span className="tw:block tw:text-sm tw:font-semibold">Policy information</span><span className="tw:mt-1 tw:block tw:text-xs tw:leading-5 tw:text-slate-600">Customer, payments and coverage at a glance</span></span><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="tw:shrink-0 tw:text-slate-500 tw:group-open:rotate-180"><path d="m6 9 6 6 6-6" /></svg></summary>
    <div className="tw:border-0 tw:border-t tw:border-solid tw:border-slate-200 tw:p-5 tw:sm:p-6"><Fields items={[
      ['Customer', `${policy.customer.fullName} (${policy.customer.accountCode})`],
      ['Premium', policyMoney(policy.premiumAmount, policy.currency)], ['Payment frequency', policy.paymentFrequency?.toLowerCase().replaceAll('_', ' ')],
      ['Sum assured', policyMoney(policy.sumAssured, policy.currency)], ['Next due date', policyDate(policy.nextDueDate)],
      ['Effective date', policyDate(policy.effectiveDate)], ['Expiry date', policyDate(policy.expiryDate)],
      ...(snapshot ? [
        ['Insurance term', snapshot.insuranceTermYears === null ? null : `${snapshot.insuranceTermYears} years`],
        ['Premium term', snapshot.premiumTermYears === null ? null : `${snapshot.premiumTermYears} years`],
        ['Annual premium', policyMoney(snapshot.annualPremium, snapshot.currency)],
      ] as [string, ReactNode][] : []),
    ]} />
      <h3 className="tw:mb-1 tw:mt-7 tw:text-sm tw:font-semibold">Coverage and benefits</h3>
      {snapshot?.benefits?.length ? <ul className="tw:m-0 tw:list-none tw:p-0">{snapshot.benefits.map((benefit, i) => <li key={`${benefit.code}:${i}`} className="tw:flex tw:flex-col tw:justify-between tw:gap-1 tw:border-0 tw:border-b tw:border-solid tw:border-slate-100 tw:py-3 tw:last:border-b-0 tw:sm:flex-row tw:sm:gap-6"><span className="tw:text-sm tw:leading-6 tw:text-slate-700">{benefit.name}</span><div className="tw:shrink-0 tw:text-sm tw:leading-6 tw:tabular-nums tw:sm:text-right"><BenefitAmount amount={benefit.amount} currency={snapshot.currency} unit={benefit.unit} />{benefit.maxDays !== null && <p className="tw:text-xs tw:text-slate-600">Maximum {benefit.maxDays} days</p>}</div></li>)}</ul> : <p className="tw:mt-3 tw:text-sm tw:text-slate-600">{policy.benefitsSnapshotStatus === 'INVALID' ? 'Coverage details are currently unavailable.' : 'No benefit details provided.'}</p>}
    </div>
  </details>;
}

function PdfPreview({ policyId, document, main = false, policyNumber }: { policyId: string; document: PolicyDocument; main?: boolean; policyNumber: string }) {
  const state = usePolicyRead(`${policyId}:${document.versionId}`, signal => documentAccess(policyId, document, 'view', signal));
  const [expired, setExpired] = useState(false);
  const [downloadState, setDownloadState] = useState({ pending: false, error: '' });
  const downloadAbort = useRef<AbortController | null>(null);
  const downloadUrl = useRef<string | null>(null);
  useEffect(() => () => {
    downloadAbort.current?.abort();
    if (downloadUrl.current) URL.revokeObjectURL(downloadUrl.current);
  }, []);
  useEffect(() => {
    if (!state.data) return;
    const timer = setTimeout(() => setExpired(true), Math.max(0, new Date(state.data.expiresAt).getTime() - Date.now()));
    return () => clearTimeout(timer);
  }, [state.data]);
  async function download() {
    downloadAbort.current?.abort();
    const controller = new AbortController(); downloadAbort.current = controller;
    setDownloadState({ pending: true, error: '' });
    try {
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(60000)]);
      const access = await documentAccess(policyId, document, 'download', signal);
      const response = await fetch(access.url, { signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!response.ok || response.headers.get('content-type')?.split(';')[0] !== 'application/pdf') throw new Error('PDF unavailable');
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      if (downloadUrl.current) URL.revokeObjectURL(downloadUrl.current);
      downloadUrl.current = URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      link.href = downloadUrl.current; link.download = `${policyNumber.replace(/[^a-zA-Z0-9._-]/g, '_')}-${document.kind.toLowerCase()}-v${document.versionNumber}.pdf`;
      link.click();
      setDownloadState({ pending: false, error: '' });
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof AuthError && [401, 403, 404].includes(error.status)) window.dispatchEvent(new Event(realtimeEvent));
      setDownloadState({ pending: false, error: error instanceof AuthError && [401, 403, 404].includes(error.status)
        ? 'This document is unavailable or access has changed.' : 'Unable to download the PDF. Please try again.' });
    }
  }
  function reloadPreview() { setExpired(false); state.retry(); }
  return <div className="tw:min-w-0">
    <div className="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3 tw:border-0 tw:border-b tw:border-solid tw:border-slate-200 tw:bg-white tw:px-4 tw:py-3 tw:sm:px-5"><div className="tw:min-w-0"><h2 className="tw:text-sm tw:font-semibold tw:leading-6">{main ? document.kind === 'POLICY_DRAFT' ? 'Draft policy document' : 'Policy document' : document.title}</h2><p className="tw:text-xs tw:leading-5 tw:text-slate-600">{main ? 'Original PDF' : kinds[document.kind]} · Version {document.versionNumber}</p></div><button type="button" className={`${button} tw:shrink-0 tw:gap-2! tw:border-blue-600! tw:bg-blue-600! tw:text-white! tw:hover:bg-blue-700!`} disabled={downloadState.pending} onClick={() => void download()}><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3v12m-5-5 5 5 5-5M5 16v5h14v-5" /></svg>{downloadState.pending ? 'Downloading…' : 'Download PDF'}</button></div>
    {downloadState.error && <p role="alert" className="tw:px-5 tw:py-3 tw:text-sm tw:text-red-700">{downloadState.error}</p>}
    <ReadState {...state} />
    {state.data && (expired ? <div className="tw:px-5 tw:py-16 tw:text-center tw:text-sm tw:text-slate-600"><p className="tw:mb-4">The preview link has expired.</p><button type="button" className={button} onClick={reloadPreview}>Reload preview</button></div> : <>
      <iframe title={`PDF preview: ${document.title}, version ${document.versionNumber}`} src={state.data.url} referrerPolicy="no-referrer" className="tw:block tw:h-[76dvh] tw:min-h-[480px] tw:w-full tw:border-0 tw:bg-slate-100" />
      <div className="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-3 tw:border-0 tw:border-t tw:border-solid tw:border-slate-200 tw:bg-white tw:px-5 tw:py-3 tw:text-xs"><a href={state.data.url} target="_blank" rel="noopener noreferrer" className="tw:text-blue-700 tw:no-underline tw:hover:underline">Open PDF in a new tab</a><button type="button" className="tw:cursor-pointer tw:text-slate-600 tw:hover:text-blue-700 tw:hover:underline" onClick={reloadPreview}>Reload preview</button></div>
    </>)}
  </div>;
}


function Documents({ policy }: { policy: PolicyDetail }) {
  const state = usePolicyRead<PolicyDocuments>(policy.id, signal => policyDocuments(policy.id, signal));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const viewer = useRef<HTMLElement>(null);
  const main = state.data?.items.find(item => item.kind === 'POLICY' || item.kind === 'POLICY_DRAFT');
  const attachments = state.data?.items.filter(item => item.kind === 'TERMS' || item.kind === 'ENDORSEMENT') ?? [];
  const selectedAttachment = attachments.find(item => item.versionId === selectedId);
  const selected = selectedAttachment ?? main;
  function showDocument(id: string | null) {
    setSelectedId(id);
    viewer.current?.scrollIntoView({ block: 'start' });
    viewer.current?.focus({ preventScroll: true });
  }
  return <>
    <section ref={viewer} tabIndex={-1} aria-label="Policy PDF" className="tw:min-w-0 tw:scroll-mt-5 tw:overflow-hidden tw:rounded-xl tw:border tw:border-solid tw:border-slate-200 tw:bg-white tw:focus:outline-none">
      <ReadState {...state} />
      {state.data && <>
        {selectedAttachment && <div className="tw:border-0 tw:border-b tw:border-solid tw:border-slate-200 tw:bg-slate-50 tw:px-5 tw:py-3"><button type="button" className="tw:cursor-pointer tw:text-xs tw:text-blue-700 tw:hover:underline" onClick={() => showDocument(null)}>{main ? 'Back to main policy' : 'Back to policy document'}</button></div>}
        {selected ? <PdfPreview key={`${policy.id}:${selected.versionId}`} policyId={policy.id} policyNumber={policy.policyNumber} document={selected} main={!selectedAttachment} /> : <div className="tw:px-5 tw:py-16 tw:text-center"><h2 className="tw:mb-2 tw:text-base tw:font-semibold">{state.data.mainDocumentStatus === 'UNAVAILABLE' ? 'Policy PDF unavailable' : 'Policy PDF not provided'}</h2><p className="tw:mx-auto tw:max-w-md tw:text-sm tw:leading-6 tw:text-slate-600">{state.data.mainDocumentStatus === 'UNAVAILABLE' ? 'The main policy document cannot be accessed right now.' : 'The main contract PDF has not been provided for this policy.'}</p></div>}
      </>}
    </section>
    <PolicyInformation policy={policy} />
    {state.data && (attachments.length > 0 || state.data.availability === 'PARTIAL' || state.data.availability === 'UNAVAILABLE') && <section aria-labelledby="supporting-documents-heading" className="tw:min-w-0"><h2 id="supporting-documents-heading" className="tw:mb-1 tw:text-sm tw:font-semibold">Supporting documents</h2><p className="tw:mb-4 tw:text-xs tw:leading-5 tw:text-slate-600">Terms and endorsements linked to this policy.</p>
      {attachments.length > 0 && <ul className="tw:m-0 tw:list-none tw:rounded-xl tw:border tw:border-solid tw:border-slate-200 tw:bg-white tw:p-0">{attachments.map(doc => <li key={doc.versionId} className="tw:flex tw:items-center tw:justify-between tw:gap-4 tw:border-0 tw:border-b tw:border-solid tw:border-slate-200 tw:px-5 tw:py-4 tw:last:border-b-0"><div className="tw:min-w-0"><h3 className="tw:wrap-anywhere tw:text-sm tw:font-medium tw:leading-6">{doc.title}</h3><p className="tw:text-xs tw:leading-5 tw:text-slate-600">{kinds[doc.kind]} · Version {doc.versionNumber}</p></div><button type="button" className={`${button} tw:shrink-0`} aria-label={`View ${doc.title}`} onClick={() => showDocument(doc.versionId)}>View PDF</button></li>)}</ul>}
      {['PARTIAL', 'UNAVAILABLE'].includes(state.data.availability) && <p role="status" className="tw:mt-3 tw:text-xs tw:leading-5 tw:text-amber-800">Some linked documents are currently unavailable.</p>}
    </section>}
  </>;
}

export function StaffPolicyDetail({ policyId }: { policyId: string }) {
  const search = useSearchParams();
  const router = useRouter();
  const state = usePolicyRead<PolicyDetail>(policyId, async signal => (await policyDetail(policyId, signal)).policy);
  const policy = state.data;
  // Migrate existing links once; navigation context belongs to this browser tab.
  useEffect(() => {
    const legacy = search.get('returnTo');
    if (!legacy) return;
    try { sessionStorage.setItem(`staff-policy-return:${policyId}`, legacy); } catch { /* Optional navigation context. */ }
    window.history.replaceState(window.history.state, '', `/staff/policies/${encodeURIComponent(policyId)}`);
  }, [policyId, search]);
  const back = policy ? `/staff/customers/${policy.customerId}` : '/staff/customers';
  function returnToCustomer(event: MouseEvent<HTMLAnchorElement>) {
    if (!policy || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
    let target = back;
    try {
      const stored = sessionStorage.getItem(`staff-policy-return:${policyId}`);
      if (stored) {
        const url = new URL(stored, window.location.origin);
        if (url.origin === window.location.origin && url.pathname === back) target = url.pathname + url.search;
      }
    } catch { /* Fall back to the current policy's customer. */ }
    event.preventDefault();
    router.push(target);
  }
  return <section className="tw:min-w-0 tw:flex-1 tw:overflow-auto tw:bg-slate-50" aria-label="Policy details">
    <div className="tw:mx-auto tw:w-full tw:max-w-[1240px] tw:px-5 tw:py-6 tw:sm:px-8">
      <Link href={back} onClick={returnToCustomer} className="tw:inline-flex tw:items-center tw:gap-2 tw:text-xs tw:leading-5 tw:text-slate-600 tw:no-underline tw:hover:text-blue-700"><svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m14 6-6 6 6 6" /></svg>Back to customer</Link>
      <header className="tw:mb-6 tw:mt-5 tw:flex tw:flex-wrap tw:items-start tw:justify-between tw:gap-3"><div className="tw:min-w-0"><h1 className="tw:wrap-anywhere tw:text-xl tw:font-semibold tw:leading-8 tw:sm:text-2xl">{policy?.policyNumber ?? 'Policy details'}</h1>{policy && <p className="tw:mt-1 tw:wrap-anywhere tw:text-sm tw:leading-6 tw:text-slate-600">{policy.product.name}</p>}</div>{policy && <Status status={policy.status} />}</header>
      <ReadState {...state} />
      {policy && <div className="tw:grid tw:min-w-0 tw:gap-6"><Documents key={policy.id} policy={policy} /></div>}
    </div>
  </section>;
}
