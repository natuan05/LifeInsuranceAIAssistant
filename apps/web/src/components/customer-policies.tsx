'use client';

import Link from 'next/link';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import {
  ownPolicies,
  ownPolicyDetail,
  ownPolicyDocuments,
  ownDocumentAccess,
  policyDate,
  policyMoney,
  type Policy,
  type PolicyDetail,
  type PolicyDocument,
  type PolicyDocuments,
  type PolicyList,
} from '@/lib/policy-api';
import { SignedPdfPreview } from './signed-pdf-preview';
import { useAuthorizedRead } from './use-authorized-read';

const button =
  'tw:inline-flex tw:items-center tw:rounded-xl tw:border tw:border-slate-200 tw:bg-white tw:px-3 tw:py-1.5 tw:text-xs tw:font-semibold tw:text-slate-700 tw:shadow-2xs tw:hover:bg-slate-50 tw:focus-visible:outline-2 tw:focus-visible:outline-emerald-600 tw:disabled:opacity-40 tw:disabled:cursor-not-allowed tw:transition-colors tw:cursor-pointer';

const statuses = ['', 'ACTIVE', 'LAPSED', 'MATURED', 'PENDING'] as const;
const labels: Record<Policy['status'], string> = {
  ACTIVE: 'Active',
  LAPSED: 'Lapsed',
  MATURED: 'Matured',
  PENDING: 'Pending',
};
const kinds: Record<PolicyDocument['kind'], string> = {
  POLICY: 'Policy contract',
  POLICY_DRAFT: 'Draft policy',
  TERMS: 'Terms and conditions',
  PRODUCT_GUIDE: 'Product guide',
  ENDORSEMENT: 'Endorsement',
};

function ReadState({
  loading,
  refreshing,
  error,
  retry,
}: {
  loading: boolean;
  refreshing?: boolean;
  error?: string;
  retry: () => void;
}) {
  if (loading)
    return (
      <div role="status" className="tw:py-12 tw:text-center tw:text-xs tw:text-slate-500">
        <div className="tw:inline-block tw:w-5 tw:h-5 tw:border-2 tw:border-emerald-600 tw:border-t-transparent tw:rounded-full tw:animate-spin tw:mb-2" />
        <p>Loading…</p>
      </div>
    );
  if (error)
    return (
      <div role="alert" className="tw:rounded-2xl tw:border tw:border-red-200 tw:bg-red-50/80 tw:p-5 tw:text-xs tw:text-red-700">
        <p className="tw:font-medium">{error}</p>
        <button type="button" className={`${button} tw:mt-3!`} onClick={retry}>
          Try again
        </button>
      </div>
    );
  if (refreshing) return <span role="status" className="tw:sr-only">Updating information…</span>;
  return null;
}

export function PolicyStatus({ status }: { status: Policy['status'] }) {
  return (
    <span
      className={`tw:inline-flex tw:items-center tw:gap-1.5 tw:rounded-full tw:px-2.5 tw:py-0.5 tw:text-xs tw:font-bold ${
        status === 'ACTIVE'
          ? 'tw:bg-emerald-50 tw:text-emerald-700 tw:border tw:border-emerald-200/80'
          : status === 'PENDING'
          ? 'tw:bg-amber-50 tw:text-amber-800 tw:border tw:border-amber-200/80'
          : status === 'MATURED'
          ? 'tw:bg-blue-50 tw:text-blue-700 tw:border tw:border-blue-200/80'
          : 'tw:bg-slate-100 tw:text-slate-700 tw:border tw:border-slate-200'
      }`}
    >
      <span className="tw:w-1.5 tw:h-1.5 tw:rounded-full tw:bg-current" />
      {labels[status] ?? status}
    </span>
  );
}

export function BenefitAmount({
  amount,
  currency,
  unit,
}: {
  amount: string | null;
  currency: string | null;
  unit: string | null;
}) {
  let period = unit?.trim() ?? '';
  if (currency && (period === currency || period.startsWith(currency + '/'))) {
    period = period.slice(currency.length).replace(/^\/\s*/, '');
  }
  return (
    <>
      {policyMoney(amount, currency)}
      {amount !== null && period ? ` / ${period}` : ''}
    </>
  );
}

function Fields({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="tw:grid tw:grid-cols-1 tw:gap-x-10 tw:gap-y-4 tw:sm:grid-cols-2 tw:lg:grid-cols-3">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt className="tw:mb-0.5 tw:text-xs tw:leading-5 tw:text-slate-500 tw:font-medium">{label}</dt>
          <dd className="tw:m-0 tw:wrap-anywhere tw:text-sm tw:font-bold tw:leading-6 tw:text-slate-900 tw:tabular-nums">
            {value ?? 'Not provided'}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function CustomerPolicyInformation({ policy }: { policy: PolicyDetail }) {
  const snapshot = policy.benefitsSnapshot;
  return (
    <details className="tw:group tw:rounded-2xl tw:border tw:border-slate-200/90 tw:bg-white tw:shadow-2xs">
      <summary className="tw:flex tw:cursor-pointer tw:list-none tw:items-center tw:justify-between tw:gap-4 tw:rounded-2xl tw:px-6 tw:py-4 tw:focus-visible:outline-2 tw:focus-visible:outline-emerald-600 tw:[&::-webkit-details-marker]:hidden">
        <div>
          <span className="tw:block tw:text-sm tw:font-bold tw:text-slate-900">Policy information</span>
          <span className="tw:mt-0.5 tw:block tw:text-xs tw:text-slate-500">
            Customer, payment schedule, and guaranteed coverage at a glance
          </span>
        </div>
        <svg
          aria-hidden="true"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="tw:shrink-0 tw:text-slate-400 tw:group-open:rotate-180 tw:transition-transform"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <div className="tw:border-t tw:border-slate-100 tw:p-6">
        <Fields
          items={[
            ['Customer', `${policy.customer.fullName} (${policy.customer.accountCode})`],
            ['Sum assured', policyMoney(policy.sumAssured, policy.currency)],
            ['Periodic premium', policyMoney(policy.premiumAmount, policy.currency)],
            ['Payment frequency', policy.paymentFrequency ? policy.paymentFrequency.toLowerCase().replaceAll('_', ' ') : null],
            ['Next due date', policyDate(policy.nextDueDate)],
            ['Effective date', policyDate(policy.effectiveDate)],
            ['Expiry date', policyDate(policy.expiryDate)],
            ...(snapshot
              ? ([
                  ['Insurance term', snapshot.insuranceTermYears !== null ? `${snapshot.insuranceTermYears} years` : null],
                  ['Premium term', snapshot.premiumTermYears !== null ? `${snapshot.premiumTermYears} years` : null],
                  ['Annual premium', policyMoney(snapshot.annualPremium, snapshot.currency)],
                ] as [string, ReactNode][])
              : []),
          ]}
        />
        <h3 className="tw:mb-3 tw:mt-6 tw:text-xs tw:font-bold tw:text-slate-900 tw:uppercase tw:tracking-wider">
          Coverage and benefits
        </h3>
        {snapshot?.benefits?.length ? (
          <ul className="tw:m-0 tw:list-none tw:divide-y tw:divide-slate-100 tw:rounded-xl tw:border tw:border-slate-200/80 tw:bg-slate-50/50 tw:p-0 tw:overflow-hidden">
            {snapshot.benefits.map((benefit, i) => (
              <li
                key={`${benefit.code}:${i}`}
                className="tw:flex tw:flex-col tw:justify-between tw:gap-1 tw:p-3.5 tw:bg-white tw:text-xs tw:sm:flex-row tw:sm:items-center"
              >
                <div>
                  <span className="tw:font-bold tw:text-slate-800 tw:block">{benefit.name}</span>
                  {benefit.maxDays !== null && (
                    <span className="tw:text-[11px] tw:text-slate-500">Maximum {benefit.maxDays} days per year</span>
                  )}
                </div>
                <span className="tw:font-extrabold tw:text-slate-900 tw:tabular-nums">
                  <BenefitAmount amount={benefit.amount} currency={snapshot.currency} unit={benefit.unit} />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="tw:mt-2 tw:text-xs tw:text-slate-500 tw:p-3 tw:bg-slate-50 tw:rounded-xl">
            {policy.benefitsSnapshotStatus === 'INVALID'
              ? 'Coverage details are currently unavailable.'
              : 'No benefit details provided.'}
          </p>
        )}
      </div>
    </details>
  );
}

function CustomerPdfPreview({
  policyId,
  document,
  main = false,
  policyNumber,
  compact = false,
}: {
  policyId: string;
  document: PolicyDocument;
  main?: boolean;
  policyNumber: string;
  compact?: boolean;
}) {
  return (
    <SignedPdfPreview
      resourceKey={`${policyId}:${document.documentId}:${document.versionId}`}
      document={document}
      title={main ? (document.kind === 'POLICY_DRAFT' ? 'Draft policy document' : 'Policy document') : document.title}
      description={main ? 'Original PDF' : kinds[document.kind] ?? 'Supporting document'}
      compact={compact}
      filename={`${policyNumber.replace(/[^a-zA-Z0-9._-]/g, '_')}-${document.kind.toLowerCase()}-v${document.versionNumber}.pdf`}
      access={(intent, signal) => ownDocumentAccess(policyId, document, intent, signal)}
    />
  );
}

export function CustomerPolicyDocumentsSection({ policy, compact = false }: { policy: PolicyDetail; compact?: boolean }) {
  const state = useAuthorizedRead<PolicyDocuments>(policy.id, signal => ownPolicyDocuments(policy.id, signal), true, {
    loginPath: '/login',
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const viewer = useRef<HTMLElement>(null);
  const main = state.data?.items.find(item => item.kind === 'POLICY' || item.kind === 'POLICY_DRAFT');
  const attachments =
    state.data?.items.filter(item => item.kind === 'TERMS' || item.kind === 'ENDORSEMENT' || item.kind === 'PRODUCT_GUIDE') ??
    [];
  const selectedAttachment = attachments.find(item => item.versionId === selectedId);
  const selected = selectedAttachment ?? main;

  function showDocument(id: string | null) {
    setSelectedId(id);
    viewer.current?.scrollIntoView({ block: 'start' });
    viewer.current?.focus({ preventScroll: true });
  }

  return (
    <>
      <section
        ref={viewer}
        tabIndex={-1}
        aria-label="Policy PDF"
        aria-busy={state.loading || state.refreshing}
        className="tw:min-w-0 tw:scroll-mt-5 tw:overflow-hidden tw:rounded-2xl tw:border tw:border-slate-200/90 tw:bg-white tw:shadow-2xs tw:focus:outline-hidden"
      >
        <ReadState {...state} />
        {state.data && (
          <>
            {selectedAttachment && (
              <div className="tw:border-b tw:border-slate-200 tw:bg-slate-50 tw:px-5 tw:py-2.5 tw:flex tw:items-center tw:justify-between">
                <span className="tw:text-xs tw:font-semibold tw:text-slate-700">
                  Viewing: <strong>{selectedAttachment.title}</strong>
                </span>
                <button
                  type="button"
                  className="tw:cursor-pointer tw:text-xs tw:font-bold tw:text-emerald-700 tw:hover:underline"
                  onClick={() => showDocument(null)}
                >
                  {main ? '← Back to main policy' : '← Back to policy document'}
                </button>
              </div>
            )}
            {selectedId && !selectedAttachment && (
              <p role="status" className="tw:px-5 tw:py-3 tw:text-xs tw:text-amber-800">
                The selected document has changed or is no longer available. Showing the current policy document when available.
              </p>
            )}
            {selected ? (
              <CustomerPdfPreview
                key={`${policy.id}:${selected.documentId}:${selected.versionId}`}
                policyId={policy.id}
                policyNumber={policy.policyNumber}
                document={selected}
                main={!selectedAttachment}
                compact={compact}
              />
            ) : (
              <div className="tw:px-5 tw:py-16 tw:text-center">
                <h2 className="tw:mb-2 tw:text-base tw:font-semibold tw:text-slate-800">
                  {state.data.mainDocumentStatus === 'UNAVAILABLE' ? 'Policy PDF unavailable' : 'Policy PDF not provided'}
                </h2>
                <p className="tw:mx-auto tw:max-w-md tw:text-xs tw:leading-relaxed tw:text-slate-500">
                  {state.data.mainDocumentStatus === 'UNAVAILABLE'
                    ? 'The main policy document cannot be accessed right now. Please try again later.'
                    : 'The main contract PDF has not been provided for this policy.'}
                </p>
              </div>
            )}
          </>
        )}
      </section>

      {/* Policy Information Section */}
      <CustomerPolicyInformation policy={policy} />

      {/* Supporting Documents Section */}
      {state.data &&
        (attachments.length > 0 || state.data.availability === 'PARTIAL' || state.data.availability === 'UNAVAILABLE') && (
          <section aria-labelledby="supporting-documents-heading" className="tw:min-w-0">
            <div className="tw:mb-3">
              <h2 id="supporting-documents-heading" className="tw:text-sm tw:font-bold tw:text-slate-900">
                Supporting documents
              </h2>
              <p className="tw:text-xs tw:text-slate-500">
                Terms, clauses, guides, and endorsements certified for this policy.
              </p>
            </div>
            {attachments.length > 0 && (
              <ul className="tw:m-0 tw:list-none tw:rounded-2xl tw:border tw:border-slate-200/90 tw:bg-white tw:p-0 tw:divide-y tw:divide-slate-100 tw:shadow-2xs tw:overflow-hidden">
                {attachments.map(doc => (
                  <li key={doc.versionId} className="tw:flex tw:items-center tw:justify-between tw:gap-4 tw:px-5 tw:py-4">
                    <div className="tw:min-w-0">
                      <h3 className="tw:wrap-anywhere tw:text-xs tw:font-bold tw:text-slate-900">{doc.title}</h3>
                      <p className="tw:text-[11px] tw:text-slate-500 tw:mt-0.5">
                        {kinds[doc.kind] ?? doc.kind} · Version {doc.versionNumber}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="tw:inline-flex tw:items-center tw:gap-1.5 tw:px-3 tw:py-1.5 tw:rounded-xl tw:border tw:border-slate-200 tw:bg-white tw:text-xs tw:font-semibold tw:text-slate-700 tw:hover:bg-slate-50 tw:shadow-2xs tw:transition-all tw:cursor-pointer tw:shrink-0"
                      aria-label={`View ${doc.title}`}
                      onClick={() => showDocument(doc.versionId)}
                    >
                      View PDF
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {['PARTIAL', 'UNAVAILABLE'].includes(state.data.availability) && (
              <p role="status" className="tw:mt-3 tw:text-xs tw:text-amber-800">
                Some linked documents are currently unavailable.
              </p>
            )}
          </section>
        )}
    </>
  );
}

export function CustomerPolicyDetail({
  policyId,
  onBack,
}: {
  policyId: string;
  onBack?: () => void;
}) {
  const router = useRouter();
  const state = useAuthorizedRead<PolicyDetail>(
    policyId,
    async signal => (await ownPolicyDetail(policyId, signal)).policy,
    true,
    {
      loginPath: '/login',
      unavailable: 'This policy is unavailable or is not part of your insurance account.',
    }
  );
  const policy = state.data;

  function handleBack(event: MouseEvent<HTMLAnchorElement | HTMLButtonElement>) {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || ('button' in event && event.button !== 0)) return;
    event.preventDefault();
    if (onBack) {
      onBack();
      return;
    }
    let target = '/customer/policies';
    try {
      const stored = sessionStorage.getItem(`customer-policy-return:${policyId}`);
      if (stored) {
        const url = new URL(stored, window.location.origin);
        if (url.origin === window.location.origin && url.pathname.startsWith('/customer')) {
          target = url.pathname + url.search;
        }
      }
    } catch {
      // Fallback
    }
    router.push(target);
  }

  return (
    <section className="tw:min-w-0 tw:flex-1 tw:space-y-6 tw:animate-in tw:fade-in-50" aria-label="Policy details">
      <div>
        <Link
          href="/customer/policies"
          onClick={handleBack}
          className="tw:inline-flex tw:items-center tw:gap-1.5 tw:text-xs tw:font-bold tw:text-slate-600 tw:hover:text-emerald-700 tw:transition-colors tw:no-underline"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back to policies
        </Link>
      </div>

      <header className="tw:flex tw:flex-wrap tw:items-start tw:justify-between tw:gap-3 tw:pb-4 tw:border-b tw:border-slate-200/80">
        <div className="tw:min-w-0">
          <h1 className="tw:text-xl tw:font-extrabold tw:text-slate-900 tw:tracking-tight">
            {policy?.product.name ?? 'Policy details'}
          </h1>
          {policy && (
            <p className="tw:mt-1 tw:text-xs tw:text-slate-500 tw:flex tw:flex-wrap tw:items-center tw:gap-2">
              <span>
                Policy #: <strong className="tw:font-mono tw:text-slate-800">#{policy.policyNumber}</strong>
              </span>
              <span className="tw:text-slate-300">·</span>
              <span>
                Product code: <strong className="tw:font-mono tw:text-slate-700">{policy.product.productCode}</strong>
              </span>
            </p>
          )}
        </div>
        {policy && <PolicyStatus status={policy.status} />}
      </header>

      <ReadState {...state} />

      {policy && (
        <div className="tw:space-y-6">
          <CustomerPolicyDocumentsSection key={policy.id} policy={policy} />
        </div>
      )}
    </section>
  );
}

export function CustomerPolicies({
  selectedPolicyId,
  onOpenChat,
}: {
  selectedPolicyId?: string;
  onOpenChat?: () => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams<{ policyId?: string }>();
  const activePolicyId = selectedPolicyId ?? params?.policyId;

  const term = (searchParams.get('search') ?? '').trim();
  const rawPage = searchParams.get('page') ?? '1';
  const page = /^\d+$/.test(rawPage) && Number(rawPage) > 0 && Number(rawPage) <= 100000 ? Number(rawPage) : 1;
  const statusParam = searchParams.get('status') ?? '';
  const status = statuses.includes(statusParam as (typeof statuses)[number]) ? statusParam : '';

  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (inputRef.current) inputRef.current.value = term;
  }, [term]);

  const state = useAuthorizedRead<PolicyList>(
    JSON.stringify([page, term, status]),
    signal => ownPolicies(page, term, status, signal),
    true,
    { loginPath: '/login' }
  );

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
    if (effectiveStatus && statuses.includes(effectiveStatus as (typeof statuses)[number])) query.set('status', effectiveStatus);
    if (effectivePage > 1) query.set('page', String(effectivePage));
    return `/customer/policies${id ? '/' + encodeURIComponent(id) : ''}${query.size ? '?' + query : ''}`;
  }

  function filter(nextPage: number, nextTerm?: string, nextStatus?: string) {
    const target = url(undefined, nextPage, nextTerm, nextStatus);
    if (target === window.location.pathname + window.location.search) state.retry();
    else router.push(target);
  }

  function rememberReturn(policyId: string) {
    try {
      sessionStorage.setItem(
        `customer-policy-return:${policyId}`,
        window.location.pathname + window.location.search
      );
    } catch {
      // Storage unavailable
    }
  }

  // If viewing a detail policy, render the detail component
  if (activePolicyId) {
    return <CustomerPolicyDetail policyId={activePolicyId} />;
  }

  return (
    <section aria-label="Insurance policies" className="tw:space-y-6 tw:animate-in tw:fade-in-50">
      
      {/* Top Header */}
      <div className="tw:flex tw:flex-col tw:sm:flex-row tw:sm:items-center tw:justify-between tw:gap-4">
        <div>
          <h1 className="tw:text-xl tw:font-extrabold tw:text-slate-900 tw:tracking-tight">
            My Insurance Policies
          </h1>
          <p className="tw:text-xs tw:text-slate-500 tw:mt-0.5">
            Certified electronic policy contracts, sum assured, and periodic premium schedules.
          </p>
        </div>
      </div>

      {/* Search & Status Filters */}
      <form
        role="search"
        aria-label="Search my policies"
        className="tw:flex tw:flex-col tw:sm:flex-row tw:items-stretch tw:sm:items-center tw:gap-3"
        onSubmit={event => {
          event.preventDefault();
          filter(1, String(new FormData(event.currentTarget).get('search') ?? '').trim());
        }}
      >
        <div className="tw:relative tw:flex-1 tw:max-w-md">
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="tw:absolute tw:left-3.5 tw:top-1/2 tw:-translate-y-1/2 tw:text-slate-400 tw:pointer-events-none"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            id="customer-policy-search"
            name="search"
            type="search"
            defaultValue={term}
            maxLength={100}
            placeholder="Search by policy number or plan name…"
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.preventDefault();
                filter(1, event.currentTarget.value.trim());
              }
            }}
            className="tw:w-full tw:rounded-xl tw:border tw:border-slate-200 tw:bg-white tw:py-2.5 tw:pl-10 tw:pr-4 tw:text-xs tw:text-slate-900 tw:placeholder:text-slate-400 tw:shadow-2xs tw:focus:outline-hidden tw:focus:border-emerald-500 tw:focus:ring-2 tw:focus:ring-emerald-100 tw:transition-all"
          />
          <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
        </div>

        <div className="tw:flex tw:items-center tw:gap-2">
          <label htmlFor="customer-policy-status" className="tw:sr-only">
            Status
          </label>
          <select
            id="customer-policy-status"
            value={status}
            onChange={event => filter(1, undefined, event.target.value)}
            className="tw:rounded-xl tw:border tw:border-slate-200 tw:bg-white tw:px-3 tw:py-2.5 tw:text-xs tw:font-semibold tw:text-slate-700 tw:shadow-2xs tw:focus:outline-hidden tw:focus:border-emerald-500 tw:focus:ring-2 tw:focus:ring-emerald-100 tw:transition-all tw:cursor-pointer"
          >
            {statuses.map(val => (
              <option key={val} value={val}>
                {val ? labels[val] : 'All statuses'}
              </option>
            ))}
          </select>
        </div>
      </form>

      {/* Policies List Data Container */}
      <div aria-busy={state.loading || state.refreshing} className="tw:min-h-0 tw:space-y-4">
        <ReadState {...state} />

        {state.data && (
          <>
            <div className="tw:text-xs tw:font-bold tw:uppercase tw:tracking-wider tw:text-slate-400">
              {state.data.total} {state.data.total === 1 ? 'policy' : 'policies'} found
            </div>

            {state.data.items.length > 0 ? (
              <div className="tw:space-y-4">
                {state.data.items.map(policy => (
                  <div
                    key={policy.id}
                    className="tw:rounded-2xl tw:border tw:border-slate-200/80 tw:bg-white tw:p-6 tw:shadow-2xs tw:transition-all tw:hover:shadow-xs tw:space-y-4"
                  >
                    {/* Header Row */}
                    <div className="tw:flex tw:flex-wrap tw:items-start tw:justify-between tw:gap-2 tw:border-b tw:border-slate-100 tw:pb-3">
                      <div className="tw:min-w-0">
                        <h2 className="tw:text-base tw:font-extrabold tw:text-slate-900 tw:m-0">
                          <Link
                            href={url(policy.id)}
                            onClick={() => rememberReturn(policy.id)}
                            className="tw:text-inherit tw:no-underline tw:hover:text-emerald-700"
                          >
                            {policy.product.name}
                          </Link>
                        </h2>
                        <div className="tw:mt-1 tw:flex tw:flex-wrap tw:items-center tw:gap-2 tw:text-xs tw:text-slate-500">
                          <span>
                            Policy #:{' '}
                            <Link
                              href={url(policy.id)}
                              onClick={() => rememberReturn(policy.id)}
                              className="tw:font-mono tw:font-bold tw:text-slate-800 tw:hover:text-emerald-700"
                            >
                              #{policy.policyNumber}
                            </Link>
                          </span>
                          <span className="tw:text-slate-300">·</span>
                          <span>
                            Product code: <strong className="tw:font-mono tw:font-semibold tw:text-slate-700">{policy.product.productCode}</strong>
                          </span>
                        </div>
                      </div>
                      <PolicyStatus status={policy.status} />
                    </div>

                    {/* Financial & Schedule Grid */}
                    <div className="tw:grid tw:grid-cols-2 tw:sm:grid-cols-4 tw:gap-4 tw:rounded-xl tw:bg-slate-50/70 tw:p-4 tw:border tw:border-slate-100">
                      <div>
                        <span className="tw:block tw:text-[10px] tw:font-bold tw:uppercase tw:tracking-wider tw:text-slate-400">
                          Sum Assured
                        </span>
                        <span className="tw:text-sm tw:font-extrabold tw:text-slate-900 tw:mt-0.5 tw:block tw:tabular-nums">
                          {policyMoney(policy.sumAssured, policy.currency)}
                        </span>
                      </div>

                      <div>
                        <span className="tw:block tw:text-[10px] tw:font-bold tw:uppercase tw:tracking-wider tw:text-slate-400">
                          Periodic Premium
                        </span>
                        <span className="tw:text-sm tw:font-extrabold tw:text-slate-900 tw:mt-0.5 tw:block tw:tabular-nums">
                          {policyMoney(policy.premiumAmount, policy.currency)}
                        </span>
                        <span className="tw:text-[10px] tw:text-slate-500 tw:capitalize">
                          {policy.paymentFrequency?.toLowerCase().replaceAll('_', ' ') ?? 'Frequency not provided'}
                        </span>
                      </div>

                      <div>
                        <span className="tw:block tw:text-[10px] tw:font-bold tw:uppercase tw:tracking-wider tw:text-slate-400">
                          Effective Date
                        </span>
                        <span className="tw:text-xs tw:font-bold tw:text-slate-800 tw:mt-1 tw:block">
                          {policyDate(policy.effectiveDate)}
                        </span>
                      </div>

                      <div>
                        <span className="tw:block tw:text-[10px] tw:font-bold tw:uppercase tw:tracking-wider tw:text-slate-400">
                          Next Due Date
                        </span>
                        <span className="tw:text-xs tw:font-bold tw:text-slate-800 tw:mt-1 tw:block">
                          {policyDate(policy.nextDueDate)}
                        </span>
                      </div>
                    </div>

                    {/* Card Actions */}
                    <div className="tw:flex tw:items-center tw:justify-end tw:gap-3 tw:pt-1">
                      <Link
                        href={url(policy.id)}
                        onClick={() => rememberReturn(policy.id)}
                        className="tw:inline-flex tw:items-center tw:gap-1.5 tw:px-4 tw:py-2 tw:rounded-xl tw:bg-slate-900 tw:text-xs tw:font-bold tw:text-white tw:hover:bg-slate-800 tw:shadow-2xs tw:transition-all tw:no-underline"
                      >
                        <span>View Policy Contract</span>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="tw:rounded-2xl tw:border tw:border-slate-200/80 tw:bg-white tw:p-12 tw:text-center tw:shadow-2xs">
                <div className="tw:w-12 tw:h-12 tw:rounded-2xl tw:bg-slate-100 tw:text-slate-400 tw:flex tw:items-center tw:justify-center tw:mx-auto tw:mb-3">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </div>
                <h3 className="tw:text-sm tw:font-bold tw:text-slate-800 tw:mb-1">
                  {state.data.total ? 'No policies on this page.' : term || status ? 'No policies match these filters.' : 'You have no insurance policies.'}
                </h3>
                <p className="tw:text-xs tw:text-slate-500">
                  {term || status
                    ? 'Try adjusting your search keywords or status filter.'
                    : 'Policies issued by AegisLife will appear here.'}
                </p>
              </div>
            )}

            {/* Pagination Controls */}
            <nav
              aria-label="Policy pagination"
              className="tw:flex tw:items-center tw:justify-between tw:gap-2 tw:pt-2 tw:text-xs tw:text-slate-500"
            >
              <button
                type="button"
                className={button}
                disabled={page <= 1}
                onClick={() => filter(page - 1)}
              >
                Previous
              </button>
              <span className="tw:font-medium">
                Page {page} of {Math.max(1, Math.ceil(state.data.total / state.data.pageSize))}
              </span>
              <button
                type="button"
                className={button}
                disabled={page * state.data.pageSize >= state.data.total}
                onClick={() => filter(page + 1)}
              >
                Next
              </button>
            </nav>
          </>
        )}
      </div>
    </section>
  );
}
