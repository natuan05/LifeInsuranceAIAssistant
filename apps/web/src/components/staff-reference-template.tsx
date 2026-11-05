import Link from 'next/link';
import type { ReactNode } from 'react';

export function StaffReferenceTemplate({ slots, active, panel, collapsed, detailsOpen, onClick }: {
    slots: Record<string, ReactNode>;
    active: string;
    panel: string;
    collapsed: boolean;
    detailsOpen: boolean;
    onClick: React.MouseEventHandler<HTMLDivElement>;
}) {
    const navLinkClass = (isActive: boolean) =>
        `nav-item-btn tw:w-full tw:flex tw:items-center tw:justify-between tw:px-3 tw:py-2.5 tw:rounded-xl tw:text-xs tw:font-medium tw:transition-all tw:no-underline tw:cursor-pointer ${
            isActive
                ? 'active tw:bg-blue-50 tw:text-blue-700 tw:font-semibold tw:shadow-xs'
                : 'tw:text-slate-600 tw:hover:text-slate-900 tw:hover:bg-slate-100/70'
        }`;

    const iconClass = (isActive: boolean) =>
        `nav-item-icon tw:w-[18px] tw:h-[18px] tw:shrink-0 ${
            isActive ? 'tw:text-blue-600' : 'tw:text-slate-400'
        }`;

    return (
        <div className="reference-template tw:flex tw:flex-1 tw:min-h-0 tw:w-full tw:h-full tw:overflow-hidden tw:bg-slate-50 tw:max-[1000px]:flex-col tw:max-[1000px]:h-auto tw:max-[1000px]:overflow-visible" onClick={onClick}>
            {/* Sidebar */}
            <aside className={`inbox-nav-col tw:shrink-0 tw:bg-white tw:border-r tw:border-slate-200/80 tw:flex tw:flex-col tw:transition-all tw:duration-200 tw:z-30 tw:max-[1000px]:w-full tw:max-[1000px]:overflow-visible ${collapsed ? 'collapsed tw:w-[68px] tw:max-[1000px]:w-full' : 'tw:w-[230px] tw:max-[1000px]:w-full'}`} id="sidebar">
                {/* Brand Header */}
                <div className="nav-col-header tw:px-4 tw:pt-4 tw:pb-3 tw:flex tw:items-center tw:justify-between tw:[.inbox-nav-col.collapsed_&]:justify-center tw:shrink-0">
                    <div className="brand-dropdown-wrap tw:flex tw:items-center tw:gap-2.5 tw:cursor-pointer" title="AegisLife">
                        <svg className="brand-icon tw:text-slate-900 tw:shrink-0" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        </svg>
                        <span className="brand-title tw:text-base tw:font-bold tw:tracking-tight tw:text-slate-900 tw:[.inbox-nav-col.collapsed_&]:hidden">AegisLife</span>
                    </div>

                    <button className="nav-icon-btn tw:w-7 tw:h-7 tw:rounded-lg tw:border tw:border-slate-200 tw:bg-white tw:flex tw:items-center tw:justify-center tw:text-slate-400 tw:hover:text-slate-700 tw:hover:bg-slate-50 tw:shadow-2xs tw:transition-all tw:cursor-pointer tw:[.inbox-nav-col.collapsed_&]:hidden" id="toggle-sidebar" title="Collapse / Expand sidebar" aria-label="Collapse / Expand sidebar">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="3" width="18" height="18" rx="2" />
                            <line x1="9" y1="3" x2="9" y2="21" />
                            <polyline points="14 10 12 12 14 14" />
                        </svg>
                    </button>
                </div>

                {/* Sidebar Search */}
                <div className="tw:px-3.5 tw:pb-2 tw:[.inbox-nav-col.collapsed_&]:hidden">
                    <div className="tw:relative">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="tw:absolute tw:left-3 tw:top-1/2 tw:-translate-y-1/2 tw:text-slate-400 tw:pointer-events-none">
                            <circle cx="11" cy="11" r="8" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                        <input
                            type="text"
                            placeholder="Search..."
                            aria-label="Quick search"
                            className="tw:w-full tw:h-9 tw:pl-9 tw:pr-3 tw:rounded-xl tw:border tw:border-slate-200 tw:bg-slate-50/70 tw:text-xs tw:text-slate-900 tw:placeholder:text-slate-400 tw:focus:bg-white tw:focus:outline-hidden tw:focus:border-blue-500 tw:focus:ring-2 tw:focus:ring-blue-100 tw:transition-all"
                        />
                    </div>
                </div>

                {/* Navigation Sections */}
                <div className="nav-scroll-area tw:flex-1 tw:overflow-y-auto tw:p-3 tw:flex tw:flex-col tw:gap-4">
                    {/* DIRECTORY */}
                    <div className="nav-group tw:flex tw:flex-col tw:gap-1">
                        <div className="nav-group-title tw:px-3 tw:py-1 tw:text-[10px] tw:font-bold tw:uppercase tw:tracking-wider tw:text-slate-400 tw:[.inbox-nav-col.collapsed_&]:hidden">
                            PORTFOLIO
                        </div>
                        {slots.customerNav}
                        <Link href="/staff/policies" className={navLinkClass(active === 'lookup')} id="nav-item-policy-lookup" data-mode="policy-lookup" title="Policy Lookup">
                            <div className="nav-item-left tw:flex tw:items-center tw:gap-3 tw:min-w-0">
                                <svg className={iconClass(active === 'lookup')} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="11" cy="11" r="8" />
                                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                                </svg>
                                <span className="nav-item-label tw:truncate tw:[.inbox-nav-col.collapsed_&]:hidden">Policy Lookup</span>
                            </div>
                        </Link>
                        <Link href="/staff/products" aria-current={active === 'products' ? 'page' : undefined} title="Products" className={navLinkClass(active === 'products')}>
                            <div className="nav-item-left tw:flex tw:items-center tw:gap-3 tw:min-w-0">
                                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClass(active === 'products')}><path d="M12 6c-3-2-6-2-9-1v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1Zm0 0v14" /></svg>
                                <span className="nav-item-label tw:truncate tw:[.inbox-nav-col.collapsed_&]:hidden">Products</span>
                            </div>
                        </Link>
                    </div>

                    {/* OPERATIONS */}
                    <div className="nav-group tw:flex tw:flex-col tw:gap-1">
                        <div className="nav-group-title tw:px-3 tw:py-1 tw:text-[10px] tw:font-bold tw:uppercase tw:tracking-wider tw:text-slate-400 tw:[.inbox-nav-col.collapsed_&]:hidden">
                            COMMUNICATIONS
                        </div>
                        <Link href="/staff/inbox?filter=all" className={navLinkClass(active === 'all')} data-category="all" id="nav-item-all" title="All conversations">
                            <div className="nav-item-left tw:flex tw:items-center tw:gap-3 tw:min-w-0">
                                <svg className={iconClass(active === 'all')} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                    <circle cx="9" cy="7" r="4" />
                                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                                </svg>
                                <span className="nav-item-label tw:truncate tw:[.inbox-nav-col.collapsed_&]:hidden">All Chats</span>
                            </div>
                        </Link>
                        <Link href="/staff/inbox?filter=requests" className={navLinkClass(active === 'request')} data-category="request" id="nav-item-requests" title="Requests queue">
                            <div className="nav-item-left tw:flex tw:items-center tw:gap-3 tw:min-w-0">
                                <svg className={iconClass(active === 'request')} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                                </svg>
                                <span className="nav-item-label tw:truncate tw:[.inbox-nav-col.collapsed_&]:hidden">Requests</span>
                            </div>
                        </Link>
                        <Link href="/staff/inbox?filter=active" className={navLinkClass(active === 'recent')} data-category="recent" id="nav-item-recents" title="Active conversations">
                            <div className="nav-item-left tw:flex tw:items-center tw:gap-3 tw:min-w-0">
                                <svg className={iconClass(active === 'recent')} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                                </svg>
                                <span className="nav-item-label tw:truncate tw:[.inbox-nav-col.collapsed_&]:hidden">Active</span>
                            </div>
                        </Link>
                        <Link href="/staff/tickets" className={navLinkClass(active === 'tickets')} data-category="tickets" id="btn-sidebar-tickets" title="Tickets">
                            <div className="nav-item-left tw:flex tw:items-center tw:gap-3 tw:min-w-0">
                                <svg className={iconClass(active === 'tickets')} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                                    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                                    <line x1="9" y1="12" x2="15" y2="12" />
                                    <line x1="9" y1="16" x2="13" y2="16" />
                                </svg>
                                <span className="nav-item-label tw:truncate tw:[.inbox-nav-col.collapsed_&]:hidden">Tickets</span>
                            </div>
                        </Link>
                    </div>
                </div>

                {/* Footer Account */}
                {slots.accountMenu}
            </aside>

            {/* Main Area */}
            <div className="tw:flex tw:flex-1 tw:flex-col tw:min-w-0 tw:h-full tw:overflow-hidden tw:bg-slate-50 tw:max-[1000px]:w-full tw:max-[1000px]:h-auto">
                {slots.headerToolbar}
                <div className="tw:flex-1 tw:min-h-0 tw:overflow-hidden tw:flex tw:flex-col tw:max-[1000px]:w-full">
                    {slots.customerDirectory}
                </div>
            </div>
        </div>
    );
}
