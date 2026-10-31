'use client';
import { realtimeEvent } from '@/lib/realtime';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams, useParams } from 'next/navigation';
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { AuthError, type Actor } from '@/lib/auth-api';
import { assignedCustomer, assignedCustomers, type Customer, type CustomerList } from '@/lib/customer-api';
import { AccountMenu } from './staff-account-menu';
import { StaffPolicyDetail } from './staff-policies';
import { StaffCustomerDirectory } from './staff-customer-directory';
import { StaffReferenceTemplate } from './staff-reference-template';
export function StaffReferenceWorkspace({ actor, pending, error: sessionError, onSignOut, account = false, accountContent }: {
    actor: Actor;
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
    const inboxFilter = search.get('filter') || 'all';
    const active = account ? 'account' : pathname.startsWith('/staff/customers') ? 'customers' : pathname.startsWith('/staff/policies') ? 'lookup' : pathname.startsWith('/staff/tickets') ? 'tickets' : (['all', 'request', 'recent', 'new'].includes(inboxFilter) ? inboxFilter : 'all');
    const [panel, setPanel] = useState('details');
    const [collapsed, setCollapsed] = useState(false);
    const [detailsOpen, setDetailsOpen] = useState(true);
    const [dismissed, setDismissed] = useState(false);
    const router = useRouter();
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
    const [detail, setDetail] = useState<Customer | null>(null);
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
    const unavailable = (text: string) => <p className={"reference-empty tw:text-[12px] tw:leading-[1.8] tw:text-[#64748b] tw:pt-[18px] tw:pr-[18px] tw:pb-[18px] tw:pl-[18px]"}>{text}</p>;
    const sectionTitle = ({ customers: 'Customers', all: 'All', request: 'Requests', recent: 'Active', new: 'New', tickets: 'Tickets', lookup: 'Policy Lookup' } as Record<string, string>)[active];
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
            router.push(category === 'customers' ? '/staff/customers' : category === 'tickets' ? '/staff/tickets' : `/staff/inbox?filter=${category}`);
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
        customerDirectory: account ? accountContent : active === 'lookup' && params.policyId ? <StaffPolicyDetail key={actor.id} policyId={params.policyId} /> : active === 'customers' ? <StaffCustomerDirectory list={list} detail={detail} selected={selected} loading={loading} error={error} page={page} searchTerm={customerSearch} onSearch={term => { const normalized = term.trim(); if (normalized === customerSearch && page === 1 && !selected) { setLoading(true); setRevision(v => v + 1); } else window.history.pushState(null, '', customerUrl(null, 1, normalized)); }} onRetry={() => { setLoading(true); setRevision(v => v + 1); }} onSelect={id => router.push(customerUrl(id))} onBack={() => router.push(customerUrl())} onPage={p => window.history.pushState(null, '', customerUrl(null, p))}/> : active === 'tickets' ? <section className={"customer-directory tw:flex-1 tw:min-w-0 tw:flex tw:flex-col tw:bg-[#f8fafc] tw:overflow-auto tw:max-[1000px]:min-h-[600px]"}><header className={"customer-directory-header tw:flex tw:justify-between tw:items-center tw:gap-[20px] tw:pt-[25px] tw:pr-[30px] tw:pb-[25px] tw:pl-[30px] tw:bg-white tw:[border-bottom:1px_solid_#eaecf0] tw:shrink-0 tw:[&_h1]:text-[21px] tw:[&_h1]:leading-[1.5] tw:[&_h1]:m-0 tw:[&_h1]:tracking-[-.3px] tw:[&_p]:text-[12px] tw:[&_p]:leading-[1.7] tw:[&_p]:text-[#64748b] tw:[&_p]:mt-[5px] tw:max-[600px]:pt-[18px] tw:max-[600px]:pr-[18px] tw:max-[600px]:pb-[18px] tw:max-[600px]:pl-[18px] tw:max-[600px]:[&_h1]:text-[18px]"}><div><h1>{params.ticketId ? 'Ticket details' : 'Tickets'}</h1><p>Support requests assigned to you.</p></div></header><div className={"customer-directory-content tw:pt-[26px] tw:pr-[30px] tw:pb-[26px] tw:pl-[30px] tw:max-[600px]:pt-[18px] tw:max-[600px]:pr-[18px] tw:max-[600px]:pb-[18px] tw:max-[600px]:pl-[18px]"}>{params.ticketId && <Link href="/staff/tickets">Back to tickets</Link>}{unavailable('Ticket data is not connected yet.')}</div></section> : null,
        accountMenu: <AccountMenu actor={actor} pending={pending} onSignOut={onSignOut}/>,
        customerNav: <Link href="/staff/customers" className={"nav-item-btn tw:[.inbox-nav-col.collapsed_&]:w-[34px] tw:[.inbox-nav-col.collapsed_&]:h-[34px] tw:[.inbox-nav-col.collapsed_&]:p-0 tw:[.inbox-nav-col.collapsed_&]:mt-[0] tw:[.inbox-nav-col.collapsed_&]:mr-[auto] tw:[.inbox-nav-col.collapsed_&]:mb-[0] tw:[.inbox-nav-col.collapsed_&]:ml-[auto] tw:[.inbox-nav-col.collapsed_&]:flex tw:[.inbox-nav-col.collapsed_&]:justify-center tw:[.inbox-nav-col.collapsed_&]:items-center tw:[.inbox-nav-col.collapsed_&]:rounded-staff-md tw:w-full tw:flex tw:items-center tw:justify-between tw:pt-[7px] tw:pr-[10px] tw:pb-[7px] tw:pl-[10px] tw:bg-transparent tw:border-none tw:rounded-staff-md tw:text-staff-text-secondary tw:font-staff tw:font-normal tw:cursor-pointer tw:[transition:all_0.15s_ease] tw:[user-select:none] tw:text-left tw:min-h-[34px] tw:leading-[20px] tw:text-[12.5px] tw:gap-[9px] tw:[&:hover]:bg-[rgba(0,_0,_0,_0.04)] tw:[&:hover]:text-staff-text-primary tw:[&.active]:bg-[rgba(15,_23,_42,_0.08)] tw:[&.active]:text-staff-text-primary tw:[&.active]:font-semibold tw:[&.active]:[box-shadow:none] tw:max-[1000px]:w-[auto] " + (active === "customers" ? "active" : "")} data-category="customers"><span className={"nav-item-left tw:[.inbox-nav-col.collapsed_&]:w-full tw:[.inbox-nav-col.collapsed_&]:h-full tw:[.inbox-nav-col.collapsed_&]:justify-center tw:[.inbox-nav-col.collapsed_&]:items-center tw:[.inbox-nav-col.collapsed_&]:m-0 tw:[.inbox-nav-col.collapsed_&]:gap-[0] tw:flex tw:items-center tw:gap-[9px] tw:min-w-0"}><svg className={"nav-item-icon tw:[.inbox-nav-col.collapsed_&]:w-[18px] tw:[.inbox-nav-col.collapsed_&]:h-[18px] tw:w-[17px] tw:h-[17px] tw:shrink-0 tw:text-staff-text-secondary tw:[transition:all_0.15s_ease] tw:[.nav-item-btn:hover_&]:text-staff-text-primary tw:[.nav-item-btn.active_&]:text-staff-brand-blue"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="7" r="4"/><path d="M4 22v-4a8 8 0 0 1 16 0v4"/></svg><span className={"nav-item-label tw:[.inbox-nav-col.collapsed_&]:hidden! tw:whitespace-nowrap tw:overflow-hidden tw:text-ellipsis"}>Customers</span></span></Link>,
        sectionTitle, filters: <><span className={"col2-filter-pill tw:flex tw:items-center tw:gap-[4px] tw:pt-[4px] tw:pr-[8px] tw:pb-[4px] tw:pl-[8px] tw:bg-staff-bg-hover tw:[border:1px_solid_transparent] tw:rounded-staff-sm tw:text-staff-text-secondary tw:font-staff tw:font-medium tw:cursor-pointer tw:[transition:all_0.15s_ease] tw:w-[auto] tw:whitespace-nowrap tw:text-[11px] tw:[&:hover]:bg-[#e2e8f0] tw:[&:hover]:text-staff-text-primary"}>{active === 'customers' ? `${list?.total ?? '…'} customers` : 'Not connected'}</span><button className={"col2-filter-pill tw:flex tw:items-center tw:gap-[4px] tw:pt-[4px] tw:pr-[8px] tw:pb-[4px] tw:pl-[8px] tw:bg-staff-bg-hover tw:[border:1px_solid_transparent] tw:rounded-staff-sm tw:text-staff-text-secondary tw:font-staff tw:font-medium tw:cursor-pointer tw:[transition:all_0.15s_ease] tw:w-[auto] tw:whitespace-nowrap tw:text-[11px] tw:[&:hover]:bg-[#e2e8f0] tw:[&:hover]:text-staff-text-primary"} disabled={loading} onClick={() => setRevision(v => v + 1)}>Refresh</button></>,
        customerName: params.conversationId ? 'Conversation' : 'Support workspace',
        avatar: <span className={"reference-avatar tw:grid tw:place-items-center tw:w-full tw:h-full tw:min-w-[32px] tw:min-h-[32px] tw:rounded-[50%] tw:bg-[#dbeafe] tw:text-[#1e40af] tw:text-[13px] tw:font-semibold"}>{'A'}</span>,
        list: unavailable('Data is not connected yet: ' + sectionTitle + '.'),
        transcript: <div className={"reference-chat-empty tw:flex-1 tw:flex tw:flex-col tw:items-center tw:justify-center tw:text-center tw:pt-[32px] tw:pr-[32px] tw:pb-[32px] tw:pl-[32px] tw:text-[#64748b] tw:[&_h2]:text-[16px] tw:[&_h2]:text-[#334155] tw:[&_h2]:mt-[16px] tw:[&_h2]:mr-[0] tw:[&_h2]:mb-[8px] tw:[&_h2]:ml-[0] tw:[&_p]:text-[12px] tw:[&_p]:leading-[1.8] tw:[&_p]:max-w-[320px]"}><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M3 4h18v13H8l-5 4Z"/></svg><h2>No conversations yet</h2><p>{params.conversationId ? 'This conversation cannot be loaded until conversation data is connected.' : 'Messages will appear here once conversations are connected.'}</p></div>,
        details: <div className={"details-scroll-body tw:flex-1 tw:overflow-y-auto tw:pt-[12px] tw:pr-[14px] tw:pb-[24px] tw:pl-[14px] tw:flex tw:flex-col tw:gap-[12px] tw:[scrollbar-width:thin]"}>{unavailable('Select a conversation to view related information.')}</div>,
        agent: <div className={"panel-view tw:w-full tw:h-full tw:hidden tw:flex-col tw:[&.active]:flex " + (panel === "agent" ? "active" : "")} id="view-agent"><div className={"details-header tw:pt-[14px] tw:pr-[14px] tw:pb-[12px] tw:pl-[14px] tw:[border-bottom:1px_solid_var(--tw-color-staff-border-light)] tw:flex tw:items-center tw:justify-between tw:[&_h2]:whitespace-nowrap tw:[&_h2]:leading-[22px] tw:[&_h2]:m-0"}><h3 className={"details-title tw:text-[14px] tw:font-bold tw:text-staff-text-primary"}>AI Copilot</h3></div>{unavailable('Copilot is not connected yet.')}</div>,
        lookup: <div className={"panel-view tw:w-full tw:h-full tw:hidden tw:flex-col tw:[&.active]:flex " + (panel === "lookup" ? "active" : "")} id="view-lookup"><div className={"details-header tw:pt-[14px] tw:pr-[14px] tw:pb-[12px] tw:pl-[14px] tw:[border-bottom:1px_solid_var(--tw-color-staff-border-light)] tw:flex tw:items-center tw:justify-between tw:[&_h2]:whitespace-nowrap tw:[&_h2]:leading-[22px] tw:[&_h2]:m-0"}><h3 className={"details-title tw:text-[14px] tw:font-bold tw:text-staff-text-primary"}>Quick Policy Lookup</h3></div>{unavailable('Policy lookup is not connected yet.')}</div>, policiesList: unavailable('The policy list is not connected yet.'), policyDossier: <>{params.policyId && <div className={"reference-empty tw:text-[12px] tw:leading-[1.8] tw:text-[#64748b] tw:pt-[18px] tw:pr-[18px] tw:pb-[18px] tw:pl-[18px]"}><Link href="/staff/policies">Back to policies</Link><h2>Policy details</h2></div>}{unavailable('Policy data is not connected yet.')}</>,
    };
    return <main className={"staff-inbox tw:[:where(&)_button]:inline-flex tw:[:where(&)_button]:w-[auto] tw:[:where(&)_button]:items-center tw:[:where(&)_button]:justify-center tw:[:where(&)_button]:gap-[0] tw:[:where(&)_button]:m-0 tw:[:where(&)_button]:p-0 tw:[:where(&)_button]:border-0 tw:[:where(&)_button]:rounded-[0] tw:[:where(&)_button]:bg-transparent tw:[:where(&)_button]:text-inherit tw:[:where(&)_button]:[font:inherit] tw:[:where(&)_button]:font-login tw:[:where(&)_svg]:shrink-0 tw:[:where(&)_button:focus-visible]:[outline:2px_solid_#2563eb] tw:[:where(&)_button:focus-visible]:[outline-offset:2px] tw:[:where(&)_a:focus-visible]:[outline:2px_solid_#2563eb] tw:[:where(&)_a:focus-visible]:[outline-offset:2px] tw:bg-staff-bg-canvas tw:text-staff-text-primary tw:min-h-[100vh] tw:flex tw:items-center tw:justify-center tw:[-webkit-font-smoothing:antialiased] tw:[-moz-osx-font-smoothing:grayscale] tw:font-login tw:[:where(&)_*]:m-0 tw:[:where(&)_*]:p-0 tw:[:where(&)_*]:box-border tw:[&.reference-live]:flex tw:[&.reference-live]:flex-col tw:[&.reference-live]:h-[100dvh] tw:[&.reference-live]:min-h-0 tw:[&.reference-live]:bg-white tw:[&.reference-live]:items-stretch tw:[&.reference-live]:justify-start tw:max-[1000px]:[&.reference-live]:h-[auto] tw:max-[1000px]:[&.reference-live]:min-h-[100dvh] tw:[:where(&)_input]:font-login tw:[:where(&)_textarea]:font-login tw:[:where(&)_select]:font-login tw:[:where(&)_a.nav-item-btn]:no-underline reference-live"}>{sessionError && <p role="alert" className={"reference-empty tw:text-[12px] tw:leading-[1.8] tw:text-[#64748b] tw:pt-[18px] tw:pr-[18px] tw:pb-[18px] tw:pl-[18px]"}>{sessionError}</p>}{actor.passwordChangeRecommended && !dismissed && <div className={"password-notice tw:flex tw:items-center tw:justify-between tw:gap-[12px] tw:shrink-0 tw:pt-[6px] tw:pr-[16px] tw:pb-[6px] tw:pl-[20px] tw:[border-bottom:1px_solid_#fef3c7] tw:bg-[#fffbeb] tw:text-[#92400e] tw:text-[12px] tw:leading-[20px] tw:[&_a]:text-inherit tw:[&_a]:underline tw:[&_a]:underline-offset-[2px] tw:[&_button]:flex tw:[&_button]:items-center tw:[&_button]:justify-center tw:[&_button]:w-[28px] tw:[&_button]:h-[28px] tw:[&_button]:shrink-0 tw:[&_button]:rounded-[5px] tw:[&_button]:text-[#92400e] tw:[&_button:hover]:bg-[#fef3c7]"}><span>We recommend changing your issued password when convenient. <Link href="/account#change-password">Change password</Link></span><button aria-label="Dismiss password reminder" onClick={() => setDismissed(true)}>×</button></div>}<StaffReferenceTemplate slots={slots} active={active} panel={panel} collapsed={collapsed} detailsOpen={detailsOpen} onClick={click}/></main>;
}
