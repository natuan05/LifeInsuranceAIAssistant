'use client';
import { StaffNotifications } from './staff-notifications';
import { StaffInbox } from './staff-inbox';
import { inboxFilter as normalizeInboxFilter } from '@/lib/conversation-api';
import { realtimeEvent } from '@/lib/realtime';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams, useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { AuthError, type Actor } from '@/lib/auth-api';
import { assignedCustomer, assignedCustomers, type StaffCustomer, type CustomerList } from '@/lib/customer-api';
import { AccountMenu } from './staff-account-menu';
import { StaffPolicyLookup } from './staff-policy-lookup';
import { StaffTickets } from './staff-tickets';
import { StaffProducts } from './staff-products';
import { StaffCustomerDirectory } from './staff-customer-directory';
import { StaffReferenceTemplate } from './staff-reference-template';

export function StaffReferenceWorkspace({ actor, csrfToken, pending, error: sessionError, onSignOut, account = false, accountContent }: {
    actor: Actor;
    csrfToken: string;
    pending: boolean;
    error: string;
    onSignOut: () => void;
    account?: boolean;
    accountContent?: ReactNode;
}) {
    const pathname = usePathname();
    const search = useSearchParams();
    const params = useParams<{
        customerId?: string;
        conversationId?: string;
        policyId?: string;
        ticketId?: string;
    }>();
    const inboxFilter = normalizeInboxFilter(search.get('filter'));
    const active = account ? 'account' : pathname.startsWith('/staff/customers') ? 'customers' : pathname.startsWith('/staff/products') ? 'products' : pathname.startsWith('/staff/policies') ? 'lookup' : pathname.startsWith('/staff/tickets') ? 'tickets' : (inboxFilter === 'requests' ? 'request' : inboxFilter === 'active' ? 'recent' : 'all');
    const [panel, setPanel] = useState('details');
    const [collapsed, setCollapsed] = useState(false);
    const [detailsOpen, setDetailsOpen] = useState(true);
    const router = useRouter();
    const notificationDenied = useCallback((error: { status: number }) => { if (error.status === 401) router.replace('/staff/login'); }, [router]);
    const rawPage = search.get('page') || '1';
    const page = /^\d+$/.test(rawPage) && Number(rawPage) >= 1 && Number(rawPage) <= 100000 ? Number(rawPage) : 1;
    const customerSearch = (search.get('search') ?? '').trim();
    function customerUrl(id: string | null = null, nextPage = page, term = customerSearch) {
        const query = new URLSearchParams();
        if (term) query.set('search', term);
        if (nextPage > 1) query.set('page', String(nextPage));
        return `/staff/customers${id ? '/' + encodeURIComponent(id) : ''}${query.size ? '?' + query : ''}`;
    }
    const selected = params.customerId ?? null;
    const [revision, setRevision] = useState(0);
    const [list, setList] = useState<CustomerList | null>(null);
    const [detail, setDetail] = useState<StaffCustomer | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const browsingCustomers = active === 'customers';
    const loadedKey = useRef('');
    useEffect(() => {
        let live = true;
        const controller = new AbortController();
        async function load() {
            const key = JSON.stringify([actor.id, page, selected, browsingCustomers, customerSearch]);
            if (loadedKey.current !== key) {
                setLoading(true);
                setList(null);
                setDetail(null);
            }
            setError('');
            if (!browsingCustomers) {
                loadedKey.current = '';
                setLoading(false);
                return;
            }
            try {
                const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]);
                const customers = await assignedCustomers(page, signal, customerSearch);
                const profile = selected ? await assignedCustomer(selected, signal) : null;
                if (live) {
                    loadedKey.current = key;
                    setList(customers);
                    setDetail(profile?.customer ?? null);
                }
            }
            catch (failure) {
                if (!live)
                    return;
                if (failure instanceof AuthError && [401, 403, 404].includes(failure.status)) {
                    setList(null);
                    setDetail(null);
                    loadedKey.current = '';
                }
                if (failure instanceof AuthError && failure.status === 401)
                    router.replace('/staff/login');
                setError(failure instanceof AuthError && failure.status === 404 ? 'This customer is unavailable or is no longer assigned to you.' : failure instanceof AuthError && failure.status === 403 ? 'You do not have permission to view this content.' : 'Unable to load data. Please try again.');
            }
            finally {
                if (live)
                    setLoading(false);
            }
        }
        void load();
        return () => { live = false; controller.abort(); };
    }, [actor.id, page, selected, revision, router, browsingCustomers, customerSearch]);
    useEffect(() => {
        const refresh = () => setRevision(v => v + 1);
        window.addEventListener(realtimeEvent, refresh);
        return () => window.removeEventListener(realtimeEvent, refresh);
    }, []);
    const unavailable = (text: string) => <p className={"reference-empty tw:text-xs tw:leading-relaxed tw:text-slate-500 tw:p-4"}>{text}</p>;
    const sectionTitle = ({ customers: 'Customers', all: 'All Chats', request: 'Requests', recent: 'Active', new: 'New', tickets: 'Tickets', lookup: 'Policy Lookup', products: 'Products', account: 'Account' } as Record<string, string>)[active] || 'Staff workspace';
    function click(event: MouseEvent<HTMLDivElement>) {
        const element = event.target as Element;
        if (element.closest('.brand-dropdown-wrap')) {
            setCollapsed(false);
            return;
        }
        const button = element.closest('button');
        if (!button)
            return;
        const category = button.getAttribute('data-category');
        if (category) {
            router.push(category === 'customers' ? '/staff/customers' : category === 'tickets' ? '/staff/tickets' : `/staff/inbox${category === 'all' ? '' : '?filter=' + (category === 'request' ? 'requests' : category === 'recent' ? 'active' : 'all')}`);
            return;
        }
        const view = button.getAttribute('data-panel');
        if (view) {
            setPanel(view);
            setDetailsOpen(true);
            return;
        }
        switch (button.id) {
            case 'btn-return-inbox':
                router.push('/staff/inbox?filter=all');
                break;
            case 'toggle-sidebar':
                setCollapsed(v => !v);
                break;
            case 'nav-item-policy-lookup':
                router.push('/staff/policies');
                break;
            case 'btn-toggle-details':
                setDetailsOpen(v => !v);
                break;
            case 'btn-close-details':
                setDetailsOpen(false);
                break;
            case 'btn-close-agent':
            case 'btn-close-lookup':
                setPanel('details');
                break;
        }
    }
    const slots = {
        headerToolbar: (
            <header aria-label="Staff workspace toolbar" className="tw:h-14 tw:shrink-0 tw:flex tw:items-center tw:justify-between tw:border-b tw:border-slate-200/80 tw:bg-white tw:px-6 tw:z-20">
                <div className="tw:flex tw:items-center tw:gap-2 tw:text-xs">
                    <span className="tw:font-semibold tw:text-slate-800">Staff workspace</span>
                    <span className="tw:text-slate-300">/</span>
                    <span className="tw:font-semibold tw:text-blue-600">{sectionTitle}</span>
                </div>
                <div className="tw:flex tw:items-center tw:gap-3">
                    <StaffNotifications
                        csrfToken={csrfToken}
                        onDenied={notificationDenied}
                        passwordChangeRecommended={actor.passwordChangeRecommended}
                    />
                </div>
            </header>
        ),
        customerDirectory: account ? accountContent : active === 'products' ? <StaffProducts key={actor.id} csrfToken={csrfToken} blocked={Boolean(sessionError) || pending} /> : active === 'lookup' ? <StaffPolicyLookup key={actor.id} /> : active === 'customers' ? <StaffCustomerDirectory actorId={actor.id} csrfToken={csrfToken} blocked={Boolean(sessionError) || pending} contactRevision={revision} onDenied={status => { setDetail(null); setError('Customer profile is no longer available.'); if (status === 401) router.replace('/staff/login'); else setRevision(v => v + 1); }} list={list} detail={detail} selected={selected} loading={loading} error={error} page={page} searchTerm={customerSearch} onSearch={term => { const normalized = term.trim(); if (normalized === customerSearch && page === 1 && !selected) { setLoading(true); setRevision(v => v + 1); } else window.history.pushState(null, '', customerUrl(null, 1, normalized)); }} onRetry={() => { setLoading(true); setRevision(v => v + 1); }} onSelect={id => router.push(customerUrl(id))} onBack={() => router.push(customerUrl())} onPage={p => window.history.pushState(null, '', customerUrl(null, p))}/> : active === 'tickets' ? <StaffTickets key={actor.id} csrfToken={csrfToken} blocked={Boolean(sessionError) || pending} /> : <StaffInbox csrfToken={csrfToken} blocked={Boolean(sessionError) || pending} />,
        accountMenu: <AccountMenu actor={actor} pending={pending} onSignOut={onSignOut}/>,
        customerNav: <Link href="/staff/customers" className={"nav-item-btn tw:w-full tw:flex tw:items-center tw:gap-3 tw:px-3 tw:py-2.5 tw:rounded-xl tw:text-xs tw:font-medium tw:transition-all tw:no-underline " + (active === "customers" ? "active tw:bg-blue-50 tw:text-blue-700 tw:font-semibold tw:shadow-xs" : "tw:text-slate-600 tw:hover:text-slate-900 tw:hover:bg-slate-100/70")} data-category="customers"><span className={"nav-item-left tw:flex tw:items-center tw:gap-3 tw:min-w-0"}><svg className={"nav-item-icon tw:w-[18px] tw:h-[18px] tw:shrink-0 " + (active === "customers" ? "tw:text-blue-600" : "tw:text-slate-400")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="7" r="4"/><path d="M4 22v-4a8 8 0 0 1 16 0v4"/></svg><span className={"nav-item-label tw:truncate tw:[.inbox-nav-col.collapsed_&]:hidden"}>Customers</span></span></Link>,
        sectionTitle,
        filters: <><span className={"col2-filter-pill tw:flex tw:items-center tw:gap-1.5 tw:px-2.5 tw:py-1 tw:bg-slate-100 tw:rounded-lg tw:text-slate-600 tw:text-xs tw:font-medium"}>{active === 'customers' ? `${list?.total ?? '…'} customers` : 'Not connected'}</span><button className={"col2-filter-pill tw:flex tw:items-center tw:gap-1.5 tw:px-2.5 tw:py-1 tw:bg-slate-100 tw:rounded-lg tw:text-slate-600 tw:text-xs tw:font-medium tw:hover:bg-slate-200 tw:cursor-pointer"} disabled={loading} onClick={() => setRevision(v => v + 1)}>Refresh</button></>,
        customerName: params.conversationId ? 'Conversation' : 'Support workspace',
        avatar: <span className={"reference-avatar tw:grid tw:place-items-center tw:w-full tw:h-full tw:min-w-[32px] tw:min-h-[32px] tw:rounded-full tw:bg-blue-100 tw:text-blue-700 tw:text-xs tw:font-semibold"}>{'A'}</span>,
        list: unavailable('Data is not connected yet: ' + sectionTitle + '.'),
        transcript: <div className={"reference-chat-empty tw:flex-1 tw:flex tw:flex-col tw:items-center tw:justify-center tw:text-center tw:p-8 tw:text-slate-500"}><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M3 4h18v13H8l-5 4Z"/></svg><h2 className="tw:text-sm tw:font-bold tw:text-slate-800 tw:mt-3 tw:mb-1">No conversations yet</h2><p className="tw:text-xs tw:leading-relaxed tw:max-w-xs">{params.conversationId ? 'This conversation cannot be loaded until conversation data is connected.' : 'Messages will appear here once conversations are connected.'}</p></div>,
        details: <div className={"details-scroll-body tw:flex-1 tw:overflow-y-auto tw:p-3 tw:flex tw:flex-col tw:gap-3"}>{unavailable('Select a conversation to view related information.')}</div>,
        agent: <div className={"panel-view tw:w-full tw:h-full tw:hidden tw:flex-col " + (panel === "agent" ? "tw:flex" : "")} id="view-agent"><div className={"details-header tw:p-3 tw:border-b tw:border-slate-200 tw:flex tw:items-center tw:justify-between"}><h3 className={"details-title tw:text-xs tw:font-bold tw:text-slate-900"}>AI Copilot</h3></div>{unavailable('Copilot is not connected yet.')}</div>,
        lookup: <div className={"panel-view tw:w-full tw:h-full tw:hidden tw:flex-col " + (panel === "lookup" ? "tw:flex" : "")} id="view-lookup"><div className={"details-header tw:p-3 tw:border-b tw:border-slate-200 tw:flex tw:items-center tw:justify-between"}><h3 className={"details-title tw:text-xs tw:font-bold tw:text-slate-900"}>Quick Policy Lookup</h3></div>{unavailable('Policy lookup is not connected yet.')}</div>,
        policiesList: unavailable('The policy list is not connected yet.'),
        policyDossier: <>{params.policyId && <div className={"reference-empty tw:text-xs tw:leading-relaxed tw:text-slate-500 tw:p-4"}><Link href="/staff/policies" className="tw:text-blue-600 tw:underline">Back to policies</Link><h2 className="tw:text-sm tw:font-bold tw:text-slate-900 tw:mt-2">Policy details</h2></div>}{unavailable('Policy data is not connected yet.')}</>,
    };
    return <main className={"staff-inbox tw:flex tw:flex-col tw:h-[100dvh] tw:w-full tw:overflow-hidden tw:bg-slate-50 tw:font-staff reference-live tw:max-[1000px]:h-auto tw:max-[1000px]:min-h-[100dvh] tw:max-[1000px]:overflow-visible"}>
        {sessionError && <p role="alert" className={"reference-empty tw:fixed tw:bottom-4 tw:right-4 tw:z-50 tw:rounded-xl tw:bg-red-50 tw:border tw:border-red-200 tw:p-4 tw:text-xs tw:text-red-700 tw:shadow-lg"}>{sessionError}</p>}
        <StaffReferenceTemplate slots={slots} active={active} panel={panel} collapsed={collapsed} detailsOpen={detailsOpen} onClick={click}/>
    </main>;
}
