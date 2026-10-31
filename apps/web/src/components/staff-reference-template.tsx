// Structural transcription of the three user-supplied attachment files. No sample customer data.
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
    return <div className={"reference-template tw:flex-1 tw:min-h-0 tw:w-full tw:flex tw:[&_button:disabled]:cursor-default tw:[&_button:disabled]:opacity-[.5] tw:max-[1000px]:block"} onClick={onClick}>
    <div className={"app-canvas tw:flex tw:items-center tw:justify-center tw:w-full tw:h-full tw:p-0 tw:max-[1000px]:h-[auto] tw:max-[1000px]:min-h-[100dvh]"}>
    <div className={"inbox-window tw:w-full tw:h-full tw:bg-staff-bg-window tw:flex tw:overflow-hidden tw:relative tw:max-w-[none] tw:border-0 tw:rounded-[0] tw:[box-shadow:none] tw:max-[1000px]:flex-col tw:max-[1000px]:h-[auto] tw:max-[1000px]:overflow-visible"}>
    <aside className={"inbox-nav-col tw:w-[215px] tw:shrink-0 tw:bg-staff-bg-nav tw:[border-right:1px_solid_var(--tw-color-staff-border-light)] tw:flex tw:flex-col tw:[transition:width_0.22s_cubic-bezier(0.16,_1,_0.3,_1)] tw:relative tw:z-[25] tw:[&.collapsed]:w-[50px] tw:[&.collapsed]:overflow-visible tw:[&.collapsed_#toggle-sidebar]:hidden! tw:max-[1000px]:w-full tw:max-[1000px]:overflow-visible tw:max-[1000px]:[&.collapsed]:w-full " + (collapsed ? "collapsed" : "")} id="sidebar">
    <div className={"nav-col-header tw:[.inbox-nav-col.collapsed_&]:pt-[13px] tw:[.inbox-nav-col.collapsed_&]:pr-[0] tw:[.inbox-nav-col.collapsed_&]:pb-[10px] tw:[.inbox-nav-col.collapsed_&]:pl-[0] tw:[.inbox-nav-col.collapsed_&]:flex tw:[.inbox-nav-col.collapsed_&]:items-center tw:[.inbox-nav-col.collapsed_&]:justify-center tw:[.inbox-nav-col.collapsed_&]:relative tw:pt-[14px] tw:pr-[14px] tw:pb-[10px] tw:pl-[14px] tw:flex tw:items-center tw:justify-between"}>
    <div className={"brand-dropdown-wrap tw:[.inbox-nav-col.collapsed_&]:w-[34px] tw:[.inbox-nav-col.collapsed_&]:h-[34px] tw:[.inbox-nav-col.collapsed_&]:p-0 tw:[.inbox-nav-col.collapsed_&]:flex tw:[.inbox-nav-col.collapsed_&]:items-center tw:[.inbox-nav-col.collapsed_&]:justify-center tw:[.inbox-nav-col.collapsed_&]:shrink-0 tw:[.inbox-nav-col.collapsed_&]:rounded-staff-md tw:[.inbox-nav-col.collapsed_&]:[transition:all_0.15s_ease] tw:[.inbox-nav-col.collapsed_&]:cursor-pointer tw:[.inbox-nav-col.collapsed_&]:bg-transparent tw:[.inbox-nav-col.collapsed_&:hover]:bg-[rgba(0,_0,_0,_0.05)] tw:flex tw:items-center tw:gap-[7px] tw:cursor-pointer tw:[user-select:none]"} title="AegisLife Life Insurance Support Portal">
    <svg className={"brand-icon tw:[.inbox-nav-col.collapsed_&]:w-[18px] tw:[.inbox-nav-col.collapsed_&]:h-[18px] tw:[.inbox-nav-col.collapsed_&]:text-staff-text-primary tw:[.inbox-nav-col.collapsed_&]:[transition:all_0.15s_ease] tw:[.inbox-nav-col.collapsed_.brand-dropdown-wrap:hover_&]:text-staff-brand-blue tw:[.inbox-nav-col.collapsed_.brand-dropdown-wrap:hover_&]:[transform:scale(1.08)] tw:text-staff-text-primary"} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z">
    </path>
    </svg>
    <span className={"brand-title tw:[.inbox-nav-col.collapsed_&]:hidden! tw:text-[15px] tw:font-bold tw:text-staff-text-primary tw:tracking-[-0.2px]"}>{"AegisLife"}</span>
    </div>
    <div className={"nav-header-actions tw:[.inbox-nav-col.collapsed_&]:hidden! tw:flex tw:items-center tw:gap-[3px]"}>
    <button className={"nav-icon-btn tw:w-[28px] tw:h-[28px] tw:flex tw:items-center tw:justify-center tw:bg-transparent tw:border-none tw:rounded-staff-sm tw:text-staff-text-secondary tw:cursor-pointer tw:[transition:all_0.15s_ease] tw:[&_svg]:[transition:transform_0.2s_ease] tw:[&:hover]:bg-[rgba(0,_0,_0,_0.05)] tw:[&:hover]:text-staff-text-primary"} id="toggle-sidebar" title="Collapse / Expand sidebar">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="2">
    </rect>
    <line x1="9" y1="3" x2="9" y2="21">
    </line>
    <polyline points="15 9 12 12 15 15">
    </polyline>
    </svg>
    </button>
    </div>
    </div>
    <div className={"nav-search-wrap tw:[.inbox-nav-col.collapsed_&]:pt-[4px] tw:[.inbox-nav-col.collapsed_&]:pr-[0] tw:[.inbox-nav-col.collapsed_&]:pb-[8px] tw:[.inbox-nav-col.collapsed_&]:pl-[0] tw:[.inbox-nav-col.collapsed_&]:flex tw:[.inbox-nav-col.collapsed_&]:justify-center tw:[.inbox-nav-col.collapsed_&]:w-full tw:pt-[4px] tw:pr-[12px] tw:pb-[10px] tw:pl-[12px]"}>
    <div className={"nav-search-box tw:[.inbox-nav-col.collapsed_&]:w-[34px] tw:[.inbox-nav-col.collapsed_&]:h-[34px] tw:[.inbox-nav-col.collapsed_&]:p-0 tw:[.inbox-nav-col.collapsed_&]:mt-[0] tw:[.inbox-nav-col.collapsed_&]:mr-[auto] tw:[.inbox-nav-col.collapsed_&]:mb-[0] tw:[.inbox-nav-col.collapsed_&]:ml-[auto] tw:[.inbox-nav-col.collapsed_&]:flex tw:[.inbox-nav-col.collapsed_&]:items-center tw:[.inbox-nav-col.collapsed_&]:justify-center tw:[.inbox-nav-col.collapsed_&]:rounded-staff-md tw:[.inbox-nav-col.collapsed_&]:bg-white tw:[.inbox-nav-col.collapsed_&]:[border:1px_solid_var(--tw-color-staff-border-light)] tw:[.inbox-nav-col.collapsed_&]:[box-shadow:0_1px_2px_rgba(0,_0,_0,_0.04)] tw:[.inbox-nav-col.collapsed_&]:cursor-pointer tw:[.inbox-nav-col.collapsed_&]:[transition:all_0.15s_ease] tw:[.inbox-nav-col.collapsed_&:hover]:[border-color:var(--tw-color-staff-border-focus)] tw:[.inbox-nav-col.collapsed_&:hover]:[box-shadow:0_0_0_2px_rgba(59,_130,_246,_0.15)] tw:[.inbox-nav-col.collapsed_&_input]:hidden tw:flex tw:items-center tw:gap-[8px] tw:bg-white tw:[border:1px_solid_var(--tw-color-staff-border-light)] tw:rounded-staff-md tw:pt-[6px] tw:pr-[10px] tw:pb-[6px] tw:pl-[10px] tw:[box-shadow:0_1px_2px_rgba(0,_0,_0,_0.04)] tw:[transition:all_0.15s_ease] tw:[&:focus-within]:[border-color:var(--tw-color-staff-border-focus)] tw:[&:focus-within]:[box-shadow:0_0_0_2px_rgba(59,_130,_246,_0.2)] tw:[&_input]:w-full tw:[&_input]:border-none tw:[&_input]:outline-none tw:[&_input]:bg-transparent tw:[&_input]:font-staff tw:[&_input]:text-[12.5px] tw:[&_input]:text-staff-text-primary tw:[&_input::placeholder]:text-staff-text-muted"}>
    <svg className={"search-glass tw:[.inbox-nav-col.collapsed_.nav-search-box_&]:w-[14px] tw:[.inbox-nav-col.collapsed_.nav-search-box_&]:h-[14px] tw:[.inbox-nav-col.collapsed_.nav-search-box_&]:text-staff-text-secondary tw:[.inbox-nav-col.collapsed_.nav-search-box_&]:shrink-0 tw:[.inbox-nav-col.collapsed_.nav-search-box:hover_&]:text-staff-brand-blue tw:[.nav-search-box_&]:text-staff-text-muted tw:[.nav-search-box_&]:shrink-0 tw:[.col2-search-wrap_&]:text-staff-text-muted tw:[.col2-search-wrap_&]:shrink-0"} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
    <circle cx="11" cy="11" r="7">
    </circle>
    <line x1="21" y1="21" x2="16.5" y2="16.5">
    </line>
    </svg>
    <input disabled type="text" id="global-search" placeholder="Search..." autoComplete="off"/>
    </div>
    </div>
    <div className={"nav-scroll-area tw:[.inbox-nav-col.collapsed_&]:pt-[4px] tw:[.inbox-nav-col.collapsed_&]:pr-[0] tw:[.inbox-nav-col.collapsed_&]:pb-[12px] tw:[.inbox-nav-col.collapsed_&]:pl-[0] tw:[.inbox-nav-col.collapsed_&]:items-center tw:[.inbox-nav-col.collapsed_&]:gap-[8px] tw:[.inbox-nav-col.collapsed_&]:overflow-y-auto tw:[.inbox-nav-col.collapsed_&]:[overflow-x:hidden] tw:[.inbox-nav-col.collapsed_&]:overflow-hidden tw:flex-1 tw:overflow-y-auto tw:pt-[0] tw:pr-[8px] tw:pb-[12px] tw:pl-[8px] tw:flex tw:flex-col tw:gap-[16px] tw:[scrollbar-width:none] tw:[&::-webkit-scrollbar]:hidden tw:max-[1000px]:flex tw:max-[1000px]:flex-wrap tw:max-[1000px]:gap-[10px] tw:max-[1000px]:pt-[10px] tw:max-[1000px]:pr-[10px] tw:max-[1000px]:pb-[10px] tw:max-[1000px]:pl-[10px]"}>
    <div className={"nav-group tw:[.inbox-nav-col.collapsed_&]:w-full tw:[.inbox-nav-col.collapsed_&]:items-center tw:[.inbox-nav-col.collapsed_&]:gap-[4px] tw:[.inbox-nav-col.collapsed_.nav-group_+_&::before]:content-[''] tw:[.inbox-nav-col.collapsed_.nav-group_+_&::before]:block tw:[.inbox-nav-col.collapsed_.nav-group_+_&::before]:w-[24px] tw:[.inbox-nav-col.collapsed_.nav-group_+_&::before]:h-[1px] tw:[.inbox-nav-col.collapsed_.nav-group_+_&::before]:bg-[#cbd5e1] tw:[.inbox-nav-col.collapsed_.nav-group_+_&::before]:mt-[4px] tw:[.inbox-nav-col.collapsed_.nav-group_+_&::before]:mr-[auto] tw:[.inbox-nav-col.collapsed_.nav-group_+_&::before]:mb-[4px] tw:[.inbox-nav-col.collapsed_.nav-group_+_&::before]:ml-[auto] tw:[.inbox-nav-col.collapsed_.nav-group_+_&::before]:shrink-0 tw:flex tw:flex-col tw:gap-[2px] tw:max-[1000px]:flex tw:max-[1000px]:items-center tw:max-[1000px]:flex-wrap"}>{slots.customerNav}<div className={"nav-group-title tw:[.inbox-nav-col.collapsed_&]:hidden! tw:pt-[6px] tw:pr-[8px] tw:pb-[4px] tw:pl-[8px] tw:text-[10px] tw:font-bold tw:[text-transform:uppercase] tw:tracking-[0.6px] tw:text-staff-text-muted tw:max-[1000px]:pt-[6px] tw:max-[1000px]:pr-[6px] tw:max-[1000px]:pb-[6px] tw:max-[1000px]:pl-[6px] tw:max-[1000px]:m-0 tw:max-[600px]:hidden"}>{"INBOXES"}</div>
    <Link href="/staff/inbox?filter=all" className={"nav-item-btn tw:[.inbox-nav-col.collapsed_&]:w-[34px] tw:[.inbox-nav-col.collapsed_&]:h-[34px] tw:[.inbox-nav-col.collapsed_&]:p-0 tw:[.inbox-nav-col.collapsed_&]:mt-[0] tw:[.inbox-nav-col.collapsed_&]:mr-[auto] tw:[.inbox-nav-col.collapsed_&]:mb-[0] tw:[.inbox-nav-col.collapsed_&]:ml-[auto] tw:[.inbox-nav-col.collapsed_&]:flex tw:[.inbox-nav-col.collapsed_&]:justify-center tw:[.inbox-nav-col.collapsed_&]:items-center tw:[.inbox-nav-col.collapsed_&]:rounded-staff-md tw:w-full tw:flex tw:items-center tw:justify-between tw:pt-[7px] tw:pr-[10px] tw:pb-[7px] tw:pl-[10px] tw:bg-transparent tw:border-none tw:rounded-staff-md tw:text-staff-text-secondary tw:font-staff tw:font-normal tw:cursor-pointer tw:[transition:all_0.15s_ease] tw:[user-select:none] tw:text-left tw:min-h-[34px] tw:leading-[20px] tw:text-[12.5px] tw:gap-[9px] tw:[&:hover]:bg-[rgba(0,_0,_0,_0.04)] tw:[&:hover]:text-staff-text-primary tw:[&.active]:bg-[rgba(15,_23,_42,_0.08)] tw:[&.active]:text-staff-text-primary tw:[&.active]:font-semibold tw:[&.active]:[box-shadow:none] tw:max-[1000px]:w-[auto] " + (active === "all" ? "active" : "")} data-category="all" id="nav-item-all" title="All conversations">
    <div className={"nav-item-left tw:[.inbox-nav-col.collapsed_&]:w-full tw:[.inbox-nav-col.collapsed_&]:h-full tw:[.inbox-nav-col.collapsed_&]:justify-center tw:[.inbox-nav-col.collapsed_&]:items-center tw:[.inbox-nav-col.collapsed_&]:m-0 tw:[.inbox-nav-col.collapsed_&]:gap-[0] tw:flex tw:items-center tw:gap-[9px] tw:min-w-0"}>
    <svg className={"nav-item-icon tw:[.inbox-nav-col.collapsed_&]:w-[18px] tw:[.inbox-nav-col.collapsed_&]:h-[18px] tw:w-[17px] tw:h-[17px] tw:shrink-0 tw:text-staff-text-secondary tw:[transition:all_0.15s_ease] tw:[.nav-item-btn:hover_&]:text-staff-text-primary tw:[.nav-item-btn.active_&]:text-staff-brand-blue"} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2">
    </path>
    <circle cx="9" cy="7" r="4">
    </circle>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87">
    </path>
    <path d="M16 3.13a4 4 0 0 1 0 7.75">
    </path>
    </svg>
    <span className={"nav-item-label tw:[.inbox-nav-col.collapsed_&]:hidden! tw:whitespace-nowrap tw:overflow-hidden tw:text-ellipsis"}>{"All"}</span>
    </div>
    </Link>
    <Link href="/staff/inbox?filter=request" className={"nav-item-btn tw:[.inbox-nav-col.collapsed_&]:w-[34px] tw:[.inbox-nav-col.collapsed_&]:h-[34px] tw:[.inbox-nav-col.collapsed_&]:p-0 tw:[.inbox-nav-col.collapsed_&]:mt-[0] tw:[.inbox-nav-col.collapsed_&]:mr-[auto] tw:[.inbox-nav-col.collapsed_&]:mb-[0] tw:[.inbox-nav-col.collapsed_&]:ml-[auto] tw:[.inbox-nav-col.collapsed_&]:flex tw:[.inbox-nav-col.collapsed_&]:justify-center tw:[.inbox-nav-col.collapsed_&]:items-center tw:[.inbox-nav-col.collapsed_&]:rounded-staff-md tw:w-full tw:flex tw:items-center tw:justify-between tw:pt-[7px] tw:pr-[10px] tw:pb-[7px] tw:pl-[10px] tw:bg-transparent tw:border-none tw:rounded-staff-md tw:text-staff-text-secondary tw:font-staff tw:font-normal tw:cursor-pointer tw:[transition:all_0.15s_ease] tw:[user-select:none] tw:text-left tw:min-h-[34px] tw:leading-[20px] tw:text-[12.5px] tw:gap-[9px] tw:[&:hover]:bg-[rgba(0,_0,_0,_0.04)] tw:[&:hover]:text-staff-text-primary tw:[&.active]:bg-[rgba(15,_23,_42,_0.08)] tw:[&.active]:text-staff-text-primary tw:[&.active]:font-semibold tw:[&.active]:[box-shadow:none] tw:max-[1000px]:w-[auto] " + (active === "request" ? "active" : "")} data-category="request" id="nav-item-requests" title="Requests queue needing staff acceptance">
    <div className={"nav-item-left tw:[.inbox-nav-col.collapsed_&]:w-full tw:[.inbox-nav-col.collapsed_&]:h-full tw:[.inbox-nav-col.collapsed_&]:justify-center tw:[.inbox-nav-col.collapsed_&]:items-center tw:[.inbox-nav-col.collapsed_&]:m-0 tw:[.inbox-nav-col.collapsed_&]:gap-[0] tw:flex tw:items-center tw:gap-[9px] tw:min-w-0"}>
    <svg className={"nav-item-icon tw:[.inbox-nav-col.collapsed_&]:w-[18px] tw:[.inbox-nav-col.collapsed_&]:h-[18px] tw:w-[17px] tw:h-[17px] tw:shrink-0 tw:text-staff-text-secondary tw:[transition:all_0.15s_ease] tw:[.nav-item-btn:hover_&]:text-staff-text-primary tw:[.nav-item-btn.active_&]:text-staff-brand-blue"} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2">
    </polygon>
    </svg>
    <span className={"nav-item-label tw:[.inbox-nav-col.collapsed_&]:hidden! tw:whitespace-nowrap tw:overflow-hidden tw:text-ellipsis"}>{"Requests"}</span>
    </div>
    </Link>
    <Link href="/staff/inbox?filter=recent" className={"nav-item-btn tw:[.inbox-nav-col.collapsed_&]:w-[34px] tw:[.inbox-nav-col.collapsed_&]:h-[34px] tw:[.inbox-nav-col.collapsed_&]:p-0 tw:[.inbox-nav-col.collapsed_&]:mt-[0] tw:[.inbox-nav-col.collapsed_&]:mr-[auto] tw:[.inbox-nav-col.collapsed_&]:mb-[0] tw:[.inbox-nav-col.collapsed_&]:ml-[auto] tw:[.inbox-nav-col.collapsed_&]:flex tw:[.inbox-nav-col.collapsed_&]:justify-center tw:[.inbox-nav-col.collapsed_&]:items-center tw:[.inbox-nav-col.collapsed_&]:rounded-staff-md tw:w-full tw:flex tw:items-center tw:justify-between tw:pt-[7px] tw:pr-[10px] tw:pb-[7px] tw:pl-[10px] tw:bg-transparent tw:border-none tw:rounded-staff-md tw:text-staff-text-secondary tw:font-staff tw:font-normal tw:cursor-pointer tw:[transition:all_0.15s_ease] tw:[user-select:none] tw:text-left tw:min-h-[34px] tw:leading-[20px] tw:text-[12.5px] tw:gap-[9px] tw:[&:hover]:bg-[rgba(0,_0,_0,_0.04)] tw:[&:hover]:text-staff-text-primary tw:[&.active]:bg-[rgba(15,_23,_42,_0.08)] tw:[&.active]:text-staff-text-primary tw:[&.active]:font-semibold tw:[&.active]:[box-shadow:none] tw:max-[1000px]:w-[auto] " + (active === "recent" ? "active" : "")} data-category="recent" id="nav-item-recents" title="Assigned / Active conversations">
    <div className={"nav-item-left tw:[.inbox-nav-col.collapsed_&]:w-full tw:[.inbox-nav-col.collapsed_&]:h-full tw:[.inbox-nav-col.collapsed_&]:justify-center tw:[.inbox-nav-col.collapsed_&]:items-center tw:[.inbox-nav-col.collapsed_&]:m-0 tw:[.inbox-nav-col.collapsed_&]:gap-[0] tw:flex tw:items-center tw:gap-[9px] tw:min-w-0"}>
    <svg className={"nav-item-icon tw:[.inbox-nav-col.collapsed_&]:w-[18px] tw:[.inbox-nav-col.collapsed_&]:h-[18px] tw:w-[17px] tw:h-[17px] tw:shrink-0 tw:text-staff-text-secondary tw:[transition:all_0.15s_ease] tw:[.nav-item-btn:hover_&]:text-staff-text-primary tw:[.nav-item-btn.active_&]:text-staff-brand-blue"} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z">
    </path>
    </svg>
    <span className={"nav-item-label tw:[.inbox-nav-col.collapsed_&]:hidden! tw:whitespace-nowrap tw:overflow-hidden tw:text-ellipsis"}>{"Active"}</span>
    </div>
    </Link>
    <Link href="/staff/inbox?filter=new" className={"nav-item-btn tw:[.inbox-nav-col.collapsed_&]:w-[34px] tw:[.inbox-nav-col.collapsed_&]:h-[34px] tw:[.inbox-nav-col.collapsed_&]:p-0 tw:[.inbox-nav-col.collapsed_&]:mt-[0] tw:[.inbox-nav-col.collapsed_&]:mr-[auto] tw:[.inbox-nav-col.collapsed_&]:mb-[0] tw:[.inbox-nav-col.collapsed_&]:ml-[auto] tw:[.inbox-nav-col.collapsed_&]:flex tw:[.inbox-nav-col.collapsed_&]:justify-center tw:[.inbox-nav-col.collapsed_&]:items-center tw:[.inbox-nav-col.collapsed_&]:rounded-staff-md tw:w-full tw:flex tw:items-center tw:justify-between tw:pt-[7px] tw:pr-[10px] tw:pb-[7px] tw:pl-[10px] tw:bg-transparent tw:border-none tw:rounded-staff-md tw:text-staff-text-secondary tw:font-staff tw:font-normal tw:cursor-pointer tw:[transition:all_0.15s_ease] tw:[user-select:none] tw:text-left tw:min-h-[34px] tw:leading-[20px] tw:text-[12.5px] tw:gap-[9px] tw:[&:hover]:bg-[rgba(0,_0,_0,_0.04)] tw:[&:hover]:text-staff-text-primary tw:[&.active]:bg-[rgba(15,_23,_42,_0.08)] tw:[&.active]:text-staff-text-primary tw:[&.active]:font-semibold tw:[&.active]:[box-shadow:none] tw:max-[1000px]:w-[auto] " + (active === "new" ? "active" : "")} data-category="new" id="nav-item-new" title="Newly issued policies">
    <div className={"nav-item-left tw:[.inbox-nav-col.collapsed_&]:w-full tw:[.inbox-nav-col.collapsed_&]:h-full tw:[.inbox-nav-col.collapsed_&]:justify-center tw:[.inbox-nav-col.collapsed_&]:items-center tw:[.inbox-nav-col.collapsed_&]:m-0 tw:[.inbox-nav-col.collapsed_&]:gap-[0] tw:flex tw:items-center tw:gap-[9px] tw:min-w-0"}>
    <svg className={"nav-item-icon tw:[.inbox-nav-col.collapsed_&]:w-[18px] tw:[.inbox-nav-col.collapsed_&]:h-[18px] tw:w-[17px] tw:h-[17px] tw:shrink-0 tw:text-staff-text-secondary tw:[transition:all_0.15s_ease] tw:[.nav-item-btn:hover_&]:text-staff-text-primary tw:[.nav-item-btn.active_&]:text-staff-brand-blue"} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z">
    </path>
    <polyline points="9 12 11 14 15 10">
    </polyline>
    </svg>
    <span className={"nav-item-label tw:[.inbox-nav-col.collapsed_&]:hidden! tw:whitespace-nowrap tw:overflow-hidden tw:text-ellipsis"}>{"New"}</span>
    </div>
    </Link>
    <Link href="/staff/tickets" className={"nav-item-btn tw:[.inbox-nav-col.collapsed_&]:w-[34px] tw:[.inbox-nav-col.collapsed_&]:h-[34px] tw:[.inbox-nav-col.collapsed_&]:p-0 tw:[.inbox-nav-col.collapsed_&]:mt-[0] tw:[.inbox-nav-col.collapsed_&]:mr-[auto] tw:[.inbox-nav-col.collapsed_&]:mb-[0] tw:[.inbox-nav-col.collapsed_&]:ml-[auto] tw:[.inbox-nav-col.collapsed_&]:flex tw:[.inbox-nav-col.collapsed_&]:justify-center tw:[.inbox-nav-col.collapsed_&]:items-center tw:[.inbox-nav-col.collapsed_&]:rounded-staff-md tw:w-full tw:flex tw:items-center tw:justify-between tw:pt-[7px] tw:pr-[10px] tw:pb-[7px] tw:pl-[10px] tw:bg-transparent tw:border-none tw:rounded-staff-md tw:text-staff-text-secondary tw:font-staff tw:font-normal tw:cursor-pointer tw:[transition:all_0.15s_ease] tw:[user-select:none] tw:text-left tw:min-h-[34px] tw:leading-[20px] tw:text-[12.5px] tw:gap-[9px] tw:[&:hover]:bg-[rgba(0,_0,_0,_0.04)] tw:[&:hover]:text-staff-text-primary tw:[&.active]:bg-[rgba(15,_23,_42,_0.08)] tw:[&.active]:text-staff-text-primary tw:[&.active]:font-semibold tw:[&.active]:[box-shadow:none] tw:max-[1000px]:w-[auto] " + (active === "tickets" ? "active" : "")} data-category="tickets" id="btn-sidebar-tickets" title="Track Tickets & Requests">
    <div className={"nav-item-left tw:[.inbox-nav-col.collapsed_&]:w-full tw:[.inbox-nav-col.collapsed_&]:h-full tw:[.inbox-nav-col.collapsed_&]:justify-center tw:[.inbox-nav-col.collapsed_&]:items-center tw:[.inbox-nav-col.collapsed_&]:m-0 tw:[.inbox-nav-col.collapsed_&]:gap-[0] tw:flex tw:items-center tw:gap-[9px] tw:min-w-0"}>
    <svg className={"nav-item-icon tw:[.inbox-nav-col.collapsed_&]:w-[18px] tw:[.inbox-nav-col.collapsed_&]:h-[18px] tw:w-[17px] tw:h-[17px] tw:shrink-0 tw:text-staff-text-secondary tw:[transition:all_0.15s_ease] tw:[.nav-item-btn:hover_&]:text-staff-text-primary tw:[.nav-item-btn.active_&]:text-staff-brand-blue"} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2">
    </path>
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1">
    </rect>
    <line x1="9" y1="12" x2="15" y2="12">
    </line>
    <line x1="9" y1="16" x2="13" y2="16">
    </line>
    </svg>
    <span className={"nav-item-label tw:[.inbox-nav-col.collapsed_&]:hidden! tw:whitespace-nowrap tw:overflow-hidden tw:text-ellipsis"}>{"Tickets"}</span>
    </div>
    </Link>
    </div>
    <div className={"nav-group tw:[.inbox-nav-col.collapsed_&]:w-full tw:[.inbox-nav-col.collapsed_&]:items-center tw:[.inbox-nav-col.collapsed_&]:gap-[4px] tw:[.inbox-nav-col.collapsed_.nav-group_+_&::before]:content-[''] tw:[.inbox-nav-col.collapsed_.nav-group_+_&::before]:block tw:[.inbox-nav-col.collapsed_.nav-group_+_&::before]:w-[24px] tw:[.inbox-nav-col.collapsed_.nav-group_+_&::before]:h-[1px] tw:[.inbox-nav-col.collapsed_.nav-group_+_&::before]:bg-[#cbd5e1] tw:[.inbox-nav-col.collapsed_.nav-group_+_&::before]:mt-[4px] tw:[.inbox-nav-col.collapsed_.nav-group_+_&::before]:mr-[auto] tw:[.inbox-nav-col.collapsed_.nav-group_+_&::before]:mb-[4px] tw:[.inbox-nav-col.collapsed_.nav-group_+_&::before]:ml-[auto] tw:[.inbox-nav-col.collapsed_.nav-group_+_&::before]:shrink-0 tw:flex tw:flex-col tw:gap-[2px] tw:max-[1000px]:flex tw:max-[1000px]:items-center tw:max-[1000px]:flex-wrap"}>
    <div className={"nav-group-title tw:[.inbox-nav-col.collapsed_&]:hidden! tw:pt-[6px] tw:pr-[8px] tw:pb-[4px] tw:pl-[8px] tw:text-[10px] tw:font-bold tw:[text-transform:uppercase] tw:tracking-[0.6px] tw:text-staff-text-muted tw:max-[1000px]:pt-[6px] tw:max-[1000px]:pr-[6px] tw:max-[1000px]:pb-[6px] tw:max-[1000px]:pl-[6px] tw:max-[1000px]:m-0 tw:max-[600px]:hidden"}>{"TOOLS"}</div>
    <Link href="/staff/policies" className={"nav-item-btn tw:[.inbox-nav-col.collapsed_&]:w-[34px] tw:[.inbox-nav-col.collapsed_&]:h-[34px] tw:[.inbox-nav-col.collapsed_&]:p-0 tw:[.inbox-nav-col.collapsed_&]:mt-[0] tw:[.inbox-nav-col.collapsed_&]:mr-[auto] tw:[.inbox-nav-col.collapsed_&]:mb-[0] tw:[.inbox-nav-col.collapsed_&]:ml-[auto] tw:[.inbox-nav-col.collapsed_&]:flex tw:[.inbox-nav-col.collapsed_&]:justify-center tw:[.inbox-nav-col.collapsed_&]:items-center tw:[.inbox-nav-col.collapsed_&]:rounded-staff-md tw:w-full tw:flex tw:items-center tw:justify-between tw:pt-[7px] tw:pr-[10px] tw:pb-[7px] tw:pl-[10px] tw:bg-transparent tw:border-none tw:rounded-staff-md tw:text-staff-text-secondary tw:font-staff tw:font-normal tw:cursor-pointer tw:[transition:all_0.15s_ease] tw:[user-select:none] tw:text-left tw:min-h-[34px] tw:leading-[20px] tw:text-[12.5px] tw:gap-[9px] tw:[&:hover]:bg-[rgba(0,_0,_0,_0.04)] tw:[&:hover]:text-staff-text-primary tw:[&.active]:bg-[rgba(15,_23,_42,_0.08)] tw:[&.active]:text-staff-text-primary tw:[&.active]:font-semibold tw:[&.active]:[box-shadow:none] tw:max-[1000px]:w-[auto] " + (active === "lookup" ? "active" : "")} id="nav-item-policy-lookup" data-mode="policy-lookup" title="Search and inspect all insurance policies">
    <div className={"nav-item-left tw:[.inbox-nav-col.collapsed_&]:w-full tw:[.inbox-nav-col.collapsed_&]:h-full tw:[.inbox-nav-col.collapsed_&]:justify-center tw:[.inbox-nav-col.collapsed_&]:items-center tw:[.inbox-nav-col.collapsed_&]:m-0 tw:[.inbox-nav-col.collapsed_&]:gap-[0] tw:flex tw:items-center tw:gap-[9px] tw:min-w-0"}>
    <svg className={"nav-item-icon tw:[.inbox-nav-col.collapsed_&]:w-[18px] tw:[.inbox-nav-col.collapsed_&]:h-[18px] tw:w-[17px] tw:h-[17px] tw:shrink-0 tw:text-staff-text-secondary tw:[transition:all_0.15s_ease] tw:[.nav-item-btn:hover_&]:text-staff-text-primary tw:[.nav-item-btn.active_&]:text-staff-brand-blue"} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8">
    </circle>
    <line x1="21" y1="21" x2="16.65" y2="16.65">
    </line>
    </svg>
    <span className={"nav-item-label tw:[.inbox-nav-col.collapsed_&]:hidden! tw:whitespace-nowrap tw:overflow-hidden tw:text-ellipsis"}>{"Policy Lookup"}</span>
    </div>
    </Link>
    </div>
    </div>{slots.accountMenu}</aside>
    {slots.customerDirectory}<div className={"workspace-panes-wrapper tw:flex tw:flex-1 tw:h-full tw:overflow-hidden tw:relative tw:[&.hidden]:hidden! tw:max-[1000px]:min-h-[600px] tw:max-[1000px]:flex-wrap tw:max-[600px]:flex tw:max-[600px]:flex-col " + (active === "lookup" || active === "customers" || active === "tickets" || active === "account" ? "hidden" : "")} id="workspace-panes">
    <section className={"conversation-list-col tw:w-[300px] tw:shrink-0 tw:bg-white tw:[border-right:1px_solid_var(--tw-color-staff-border-light)] tw:flex tw:flex-col tw:max-[1000px]:w-[35%] tw:max-[1000px]:min-w-[220px] tw:max-[600px]:w-full tw:max-[600px]:min-w-0 tw:max-[600px]:max-h-[400px]"} id="conversation-list-col">
    <div className={"col2-header tw:pt-[16px] tw:pr-[20px] tw:pb-[12px] tw:pl-[20px] tw:flex tw:flex-col tw:gap-[10px] tw:[border-bottom:1px_solid_var(--tw-color-staff-border-light)]"}>
    <div className={"col2-title-row tw:flex tw:items-center tw:justify-between"}>
    <h2 className={"col2-heading tw:font-bold tw:text-staff-text-primary tw:tracking-[-0.2px] tw:text-[16px] tw:leading-[24px]"} id="col2-section-title">{slots.sectionTitle}</h2>
    </div>
    <div className={"col2-filter-row tw:flex tw:items-center tw:gap-[6px]"}>{slots.filters}</div>
    <div className={"col2-search-wrap tw:bg-staff-bg-hover tw:[border:1px_solid_transparent] tw:rounded-staff-sm tw:pt-[6px] tw:pr-[9px] tw:pb-[6px] tw:pl-[9px] tw:[transition:all_0.15s_ease] tw:flex tw:items-center tw:gap-[8px] tw:[&:focus-within]:bg-white tw:[&:focus-within]:[border-color:var(--tw-color-staff-border-focus)] tw:[&:focus-within]:[box-shadow:0_0_0_2px_rgba(59,_130,_246,_0.15)] tw:[&_input]:w-full tw:[&_input]:border-none tw:[&_input]:bg-transparent tw:[&_input]:outline-none tw:[&_input]:font-staff tw:[&_input]:text-[11.5px] tw:[&_input]:text-staff-text-primary tw:[&_input]:min-w-0 tw:[&_input]:flex-1 tw:[&_input::placeholder]:text-staff-text-muted"}>
    <svg className={"search-glass tw:[.inbox-nav-col.collapsed_.nav-search-box_&]:w-[14px] tw:[.inbox-nav-col.collapsed_.nav-search-box_&]:h-[14px] tw:[.inbox-nav-col.collapsed_.nav-search-box_&]:text-staff-text-secondary tw:[.inbox-nav-col.collapsed_.nav-search-box_&]:shrink-0 tw:[.inbox-nav-col.collapsed_.nav-search-box:hover_&]:text-staff-brand-blue tw:[.nav-search-box_&]:text-staff-text-muted tw:[.nav-search-box_&]:shrink-0 tw:[.col2-search-wrap_&]:text-staff-text-muted tw:[.col2-search-wrap_&]:shrink-0"} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="7">
    </circle>
    <line x1="21" y1="21" x2="16.5" y2="16.5">
    </line>
    </svg>
    <input disabled type="text" id="sidebar-cust-search" placeholder="Search conversations..." autoComplete="off"/>
    </div>
    </div>
    <div className={"col2-cards-container tw:flex-1 tw:overflow-y-auto tw:flex tw:flex-col tw:gap-[6px] tw:[scrollbar-width:thin] tw:[scrollbar-color:#cbd5e1_transparent] tw:pt-[12px] tw:pr-[20px] tw:pb-[12px] tw:pl-[20px] tw:[&::-webkit-scrollbar]:w-[4px] tw:[&::-webkit-scrollbar-thumb]:bg-[#cbd5e1] tw:[&::-webkit-scrollbar-thumb]:rounded-[4px]"} id="col2-customer-list">{slots.list}</div>
    </section>
    <section className={"chat-workspace-col tw:flex-1 tw:min-w-0 tw:bg-white tw:[border-right:1px_solid_var(--tw-color-staff-border-light)] tw:flex tw:flex-col tw:max-[1000px]:min-w-0 tw:max-[600px]:min-h-[400px]"} id="chat-workspace-col">
    <header className={"chat-top-header tw:pt-[12px] tw:pr-[18px] tw:pb-[12px] tw:pl-[18px] tw:[border-bottom:1px_solid_var(--tw-color-staff-border-light)] tw:flex tw:items-center tw:justify-between tw:gap-[12px]"}>
    <div className={"chat-header-left tw:flex tw:items-center tw:gap-[10px] tw:min-w-0"}>
    <div className={"chat-header-avatar-box tw:w-[36px] tw:h-[36px] tw:rounded-[50%] tw:shrink-0 tw:overflow-hidden"}>{slots.avatar}</div>
    <div className={"chat-header-text tw:flex tw:items-center tw:min-w-0"}>
    <div className={"chat-header-title-row tw:flex tw:items-center tw:gap-[8px] tw:min-w-0"}>
    <h2 className={"chat-header-name tw:text-[15px] tw:font-bold tw:text-staff-text-primary tw:tracking-[-0.2px] tw:whitespace-nowrap tw:overflow-hidden tw:text-ellipsis"} id="chat-header-cust-name">{slots.customerName}</h2>

    </div>
    </div>
    </div>
    <div className={"chat-header-actions tw:flex tw:items-center tw:gap-[6px] tw:shrink-0"}>
    <button className={"top-action-btn tw:inline-flex tw:items-center tw:gap-[5px] tw:pt-[6px] tw:pr-[10px] tw:pb-[6px] tw:pl-[10px] tw:bg-staff-bg-hover tw:[border:1px_solid_var(--tw-color-staff-border-light)] tw:rounded-staff-md tw:text-staff-text-secondary tw:font-staff tw:text-[12px] tw:font-medium tw:cursor-pointer tw:[transition:all_0.15s_ease] tw:[user-select:none] tw:[&:hover]:bg-[#e2e8f0] tw:[&:hover]:text-staff-text-primary tw:[&.takeover-pill]:bg-[rgba(16,_185,_129,_0.1)] tw:[&.takeover-pill]:[border-color:rgba(16,_185,_129,_0.3)] tw:[&.takeover-pill]:text-[#059669] tw:[&.takeover-pill.active]:bg-staff-color-green tw:[&.takeover-pill.active]:[border-color:var(--tw-color-staff-color-green)] tw:[&.takeover-pill.active]:text-white takeover-pill active"} disabled id="btn-takeover" title="Toggle Live Takeover Mode">
    <span className={"live-dot tw:w-[7px] tw:h-[7px] tw:bg-[currentColor] tw:rounded-[50%] tw:animate-live-dot"}>
    </span>
    <span className={"takeover-txt"}>{"Takeover"}</span>
    </button>
    </div>
    </header>
    <div className={"chat-flow-container tw:flex-1 tw:overflow-y-auto tw:pt-[16px] tw:pr-[20px] tw:pb-[16px] tw:pl-[20px] tw:flex tw:flex-col tw:bg-[#fafbfc] tw:[scrollbar-width:thin] tw:[scrollbar-color:#cbd5e1_transparent] tw:[&::-webkit-scrollbar]:w-[5px] tw:[&::-webkit-scrollbar-thumb]:bg-[#cbd5e1] tw:[&::-webkit-scrollbar-thumb]:rounded-[4px]"} id="chat-flow">
    <div className={"chat-flow-inner tw:flex tw:flex-col tw:gap-[12px] tw:justify-end tw:min-h-[100%]"} id="chat-flow-inner">{slots.transcript}</div>
    </div>
    <div className={"chat-composer-wrapper tw:pt-[12px] tw:pr-[18px] tw:pb-[16px] tw:pl-[18px] tw:bg-white tw:[border-top:1px_solid_var(--tw-color-staff-border-light)]"}>
    <div className={"chat-composer-box tw:flex tw:flex-col tw:bg-white tw:[border:1px_solid_var(--tw-color-staff-border-light)] tw:rounded-staff-lg tw:[box-shadow:0_1px_3px_rgba(0,_0,_0,_0.05)] tw:[transition:all_0.15s_ease] tw:overflow-hidden tw:[&:focus-within]:[border-color:var(--tw-color-staff-border-focus)] tw:[&:focus-within]:[box-shadow:0_0_0_2px_rgba(59,_130,_246,_0.18)] tw:[&_textarea]:w-full tw:[&_textarea]:border-none tw:[&_textarea]:outline-none tw:[&_textarea]:pt-[10px] tw:[&_textarea]:pr-[12px] tw:[&_textarea]:pb-[10px] tw:[&_textarea]:pl-[12px] tw:[&_textarea]:font-staff tw:[&_textarea]:text-[13px] tw:[&_textarea]:text-staff-text-primary tw:[&_textarea]:[resize:none] tw:[&_textarea]:bg-transparent tw:[&_textarea]:leading-[1.4] tw:[&_textarea::placeholder]:text-staff-text-muted"}>
    <textarea disabled id="chat-message-input" rows={2} placeholder="Type your response to the customer (Press Enter to send)..." autoComplete="off">
    </textarea>
    <div className={"composer-action-bar tw:flex tw:items-center tw:justify-between tw:pt-[6px] tw:pr-[10px] tw:pb-[8px] tw:pl-[10px] tw:bg-[#fafbfc] tw:[border-top:1px_solid_#f1f5f9]"}>
    <div className={"composer-tools-left tw:flex tw:items-center tw:gap-[4px]"}>
    <button className={"tool-btn tw:inline-flex tw:items-center tw:gap-[4px] tw:pt-[4px] tw:pr-[6px] tw:pb-[4px] tw:pl-[6px] tw:bg-transparent tw:border-none tw:rounded-staff-sm tw:text-staff-text-muted tw:font-staff tw:text-[11.5px] tw:cursor-pointer tw:[transition:all_0.12s_ease] tw:[&:hover]:bg-[rgba(0,_0,_0,_0.05)] tw:[&:hover]:text-staff-text-primary"} disabled id="btn-macro-popup" title="Quick response templates">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="4" y="4" width="16" height="16" rx="2">
    </rect>
    <line x1="9" y1="9" x2="15" y2="9">
    </line>
    <line x1="9" y1="13" x2="15" y2="13">
    </line>
    <line x1="9" y1="17" x2="12" y2="17">
    </line>
    </svg>
    <span>{"Templates"}</span>
    </button>
    <button className={"tool-btn tw:inline-flex tw:items-center tw:gap-[4px] tw:pt-[4px] tw:pr-[6px] tw:pb-[4px] tw:pl-[6px] tw:bg-transparent tw:border-none tw:rounded-staff-sm tw:text-staff-text-muted tw:font-staff tw:text-[11.5px] tw:cursor-pointer tw:[transition:all_0.12s_ease] tw:[&:hover]:bg-[rgba(0,_0,_0,_0.05)] tw:[&:hover]:text-staff-text-primary"} title="Attach documents">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48">
    </path>
    </svg>
    </button>
    </div>
    <div className={"composer-tools-right tw:flex tw:items-center tw:gap-[8px]"}>
    <span className={"send-shortcut-hint tw:text-[10.5px] tw:text-staff-text-muted"}>{"Enter to send"}</span>
    <button className={"btn-send-message tw:inline-flex tw:items-center tw:gap-[5px] tw:pt-[6px] tw:pr-[12px] tw:pb-[6px] tw:pl-[12px] tw:bg-staff-brand-blue tw:text-white tw:border-none tw:rounded-staff-md tw:font-staff tw:text-[12px] tw:font-semibold tw:cursor-pointer tw:[transition:background_0.15s_ease] tw:[&:hover]:bg-staff-brand-blue-hover"} disabled id="btn-send-chat" title="Send message (Enter)">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
    <line x1="22" y1="2" x2="11" y2="13">
    </line>
    <polygon points="22 2 15 22 11 13 2 9 22 2">
    </polygon>
    </svg>
    <span>{"Send"}</span>
    </button>
    </div>
    </div>
    </div>
    </div>
    </section>
    <nav className={"right-panel-rail tw:w-[46px] tw:shrink-0 tw:bg-[#edf2f7] tw:[border-left:1px_solid_var(--tw-color-staff-border-light)] tw:[border-right:1px_solid_var(--tw-color-staff-border-light)] tw:flex tw:flex-col tw:items-center tw:pt-[10px] tw:pr-[0] tw:pb-[12px] tw:pl-[0] tw:z-[10] tw:max-[1000px]:w-[46px] tw:max-[600px]:w-full tw:max-[600px]:flex-row tw:max-[600px]:justify-start tw:max-[600px]:pt-[8px] tw:max-[600px]:pr-[8px] tw:max-[600px]:pb-[8px] tw:max-[600px]:pl-[8px]"} id="right-panel-rail" aria-label="Right Panel View Switcher">
    <div className={"rail-top-action tw:flex tw:flex-col tw:items-center tw:w-full"}>
    <button className={"rail-btn tw:w-[34px] tw:h-[34px] tw:flex tw:items-center tw:justify-center tw:rounded-staff-md tw:cursor-pointer tw:[transition:all_0.16s_ease] tw:p-0 tw:[&.active]:bg-staff-brand-blue tw:[&.active]:[border-color:var(--tw-color-staff-brand-blue)] tw:[&.active]:text-white tw:[&.active]:[box-shadow:0_2px_6px_rgba(37,_99,_235,_0.25)] tw:[&.active_svg]:text-white tw:[&.active:hover]:bg-staff-brand-blue-hover tw:[&.active:hover]:text-white tw:[&.active:hover_svg]:text-white tw:max-[600px]:[.right-panel-rail_&]:mt-[0] tw:max-[600px]:[.right-panel-rail_&]:mr-[4px] tw:max-[600px]:[.right-panel-rail_&]:mb-[0] tw:max-[600px]:[.right-panel-rail_&]:ml-[4px] rail-btn-toggle tw:bg-transparent tw:[border:1px_solid_transparent] tw:text-[#64748b] tw:[box-shadow:none] tw:[&_svg]:text-[#64748b] tw:[&_svg]:[transition:all_0.18s_ease] tw:[&:hover]:bg-[rgba(0,_0,_0,_0.06)] tw:[&:hover]:[border-color:transparent] tw:[&:hover]:text-staff-text-primary tw:[&:hover]:[box-shadow:none] tw:[&:hover_svg]:text-staff-text-primary"} id="btn-toggle-details" title="Collapse / Expand Details Panel">
    <svg className={"rail-toggle-svg"} width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="2">
    </rect>
    <line x1="15" y1="3" x2="15" y2="21">
    </line>
    </svg>
    </button>
    </div>
    <div className={"rail-divider tw:w-[24px] tw:h-[1px] tw:bg-[#cbd5e1] tw:mt-[7px] tw:mr-[0] tw:mb-[8px] tw:ml-[0]"}>
    </div>
    <div className={"rail-views-group tw:flex tw:flex-col tw:items-center tw:gap-[6px] tw:w-full"}>
    <button className={"rail-btn tw:w-[34px] tw:h-[34px] tw:flex tw:items-center tw:justify-center tw:bg-transparent tw:[border:1px_solid_transparent] tw:rounded-staff-md tw:text-[#64748b] tw:cursor-pointer tw:[transition:all_0.16s_ease] tw:p-0 tw:[&_svg]:text-[#64748b] tw:[&_svg]:[transition:all_0.15s_ease] tw:[&:hover]:bg-[rgba(0,_0,_0,_0.06)] tw:[&:hover]:[border-color:transparent] tw:[&:hover]:text-staff-text-primary tw:[&:hover]:[box-shadow:none] tw:[&:hover_svg]:text-staff-text-primary tw:[&.active]:bg-staff-brand-blue tw:[&.active]:[border-color:var(--tw-color-staff-brand-blue)] tw:[&.active]:text-white tw:[&.active]:[box-shadow:0_2px_6px_rgba(37,_99,_235,_0.25)] tw:[&.active_svg]:text-white tw:[&.active:hover]:bg-staff-brand-blue-hover tw:[&.active:hover]:text-white tw:[&.active:hover_svg]:text-white tw:max-[600px]:[.right-panel-rail_&]:mt-[0] tw:max-[600px]:[.right-panel-rail_&]:mr-[4px] tw:max-[600px]:[.right-panel-rail_&]:mb-[0] tw:max-[600px]:[.right-panel-rail_&]:ml-[4px] " + (detailsOpen && panel === "details" ? "active" : "")} aria-pressed={detailsOpen && panel === "details"} id="rail-btn-details" data-panel="details" title="Case Details & Customer Profile">
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z">
    </path>
    <polyline points="14 2 14 8 20 8">
    </polyline>
    <line x1="16" y1="13" x2="8" y2="13">
    </line>
    <line x1="16" y1="17" x2="8" y2="17">
    </line>
    </svg>
    </button>
    <button className={"rail-btn tw:w-[34px] tw:h-[34px] tw:flex tw:items-center tw:justify-center tw:bg-transparent tw:[border:1px_solid_transparent] tw:rounded-staff-md tw:text-[#64748b] tw:cursor-pointer tw:[transition:all_0.16s_ease] tw:p-0 tw:[&_svg]:text-[#64748b] tw:[&_svg]:[transition:all_0.15s_ease] tw:[&:hover]:bg-[rgba(0,_0,_0,_0.06)] tw:[&:hover]:[border-color:transparent] tw:[&:hover]:text-staff-text-primary tw:[&:hover]:[box-shadow:none] tw:[&:hover_svg]:text-staff-text-primary tw:[&.active]:bg-staff-brand-blue tw:[&.active]:[border-color:var(--tw-color-staff-brand-blue)] tw:[&.active]:text-white tw:[&.active]:[box-shadow:0_2px_6px_rgba(37,_99,_235,_0.25)] tw:[&.active_svg]:text-white tw:[&.active:hover]:bg-staff-brand-blue-hover tw:[&.active:hover]:text-white tw:[&.active:hover_svg]:text-white tw:max-[600px]:[.right-panel-rail_&]:mt-[0] tw:max-[600px]:[.right-panel-rail_&]:mr-[4px] tw:max-[600px]:[.right-panel-rail_&]:mb-[0] tw:max-[600px]:[.right-panel-rail_&]:ml-[4px] " + (detailsOpen && panel === "agent" ? "active" : "")} aria-pressed={detailsOpen && panel === "agent"} id="rail-btn-agent" data-panel="agent" title="AI Agent Copilot & Knowledge RAG">
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2">
    </polygon>
    </svg>
    </button>
    <button className={"rail-btn tw:w-[34px] tw:h-[34px] tw:flex tw:items-center tw:justify-center tw:bg-transparent tw:[border:1px_solid_transparent] tw:rounded-staff-md tw:text-[#64748b] tw:cursor-pointer tw:[transition:all_0.16s_ease] tw:p-0 tw:[&_svg]:text-[#64748b] tw:[&_svg]:[transition:all_0.15s_ease] tw:[&:hover]:bg-[rgba(0,_0,_0,_0.06)] tw:[&:hover]:[border-color:transparent] tw:[&:hover]:text-staff-text-primary tw:[&:hover]:[box-shadow:none] tw:[&:hover_svg]:text-staff-text-primary tw:[&.active]:bg-staff-brand-blue tw:[&.active]:[border-color:var(--tw-color-staff-brand-blue)] tw:[&.active]:text-white tw:[&.active]:[box-shadow:0_2px_6px_rgba(37,_99,_235,_0.25)] tw:[&.active_svg]:text-white tw:[&.active:hover]:bg-staff-brand-blue-hover tw:[&.active:hover]:text-white tw:[&.active:hover_svg]:text-white tw:max-[600px]:[.right-panel-rail_&]:mt-[0] tw:max-[600px]:[.right-panel-rail_&]:mr-[4px] tw:max-[600px]:[.right-panel-rail_&]:mb-[0] tw:max-[600px]:[.right-panel-rail_&]:ml-[4px] " + (detailsOpen && panel === "lookup" ? "active" : "")} aria-pressed={detailsOpen && panel === "lookup"} id="rail-btn-lookup" data-panel="lookup" title="Quick Policy Lookup">
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8">
    </circle>
    <line x1="21" y1="21" x2="16.65" y2="16.65">
    </line>
    </svg>
    </button>
    </div>
    </nav>
    <aside className={"details-panel-col tw:w-[330px] tw:shrink-0 tw:bg-[#f8fafc] tw:[border-left:1px_solid_var(--tw-color-staff-border-light)] tw:flex tw:flex-col tw:relative tw:overflow-hidden tw:[transition:width_0.22s_cubic-bezier(0.16,_1,_0.3,_1)] tw:[&.collapsed]:w-[0] tw:[&.collapsed]:[border-left:none] tw:max-[1000px]:w-full tw:max-[1000px]:max-h-[none] tw:max-[1000px]:[&.collapsed]:hidden " + (detailsOpen ? "" : "collapsed")} id="right-panel-col">
    <div className={"panel-view tw:w-full tw:h-full tw:hidden tw:flex-col tw:[&.active]:flex " + (panel === "details" ? "active" : "")} id="view-details">
    <div className={"details-header tw:pt-[14px] tw:pr-[14px] tw:pb-[12px] tw:pl-[14px] tw:[border-bottom:1px_solid_var(--tw-color-staff-border-light)] tw:flex tw:items-center tw:justify-between tw:[&_h2]:whitespace-nowrap tw:[&_h2]:leading-[22px] tw:[&_h2]:m-0"}>
    <h3 className={"details-title tw:text-[14px] tw:font-bold tw:text-staff-text-primary"}>{"Case Details"}</h3>
    <button className={"details-close-btn tw:bg-transparent tw:border-none tw:text-staff-text-muted tw:cursor-pointer tw:rounded-staff-sm tw:pt-[3px] tw:pr-[3px] tw:pb-[3px] tw:pl-[3px] tw:flex tw:items-center tw:[transition:all_0.12s_ease] tw:w-[26px] tw:h-[26px] tw:shrink-0 tw:justify-center tw:text-[20px] tw:leading-[1] tw:[&:hover]:bg-staff-bg-hover tw:[&:hover]:text-staff-text-primary"} id="btn-close-details" title="Collapse Panel">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18">
    </line>
    <line x1="6" y1="6" x2="18" y2="18">
    </line>
    </svg>
    </button>
    </div>{slots.details}</div>{slots.agent}{slots.lookup}</aside>
    </div>
    <section className={"full-lookup-portal-view tw:hidden tw:flex-1 tw:h-full tw:flex-col tw:bg-white tw:overflow-hidden tw:relative tw:[&.active]:flex! " + (active === "lookup" && !slots.customerDirectory ? "active" : "")} id="full-policy-lookup-view">
    <header className={"full-lookup-topbar tw:pt-[12px] tw:pr-[18px] tw:pb-[12px] tw:pl-[18px] tw:bg-white tw:[border-bottom:1px_solid_var(--tw-color-staff-border-light)] tw:flex tw:items-center tw:justify-between tw:gap-[16px] tw:shrink-0"}>
    <div className={"topbar-left-group tw:flex tw:items-center tw:gap-[14px]"}>
    <button className={"btn-return-inbox tw:inline-flex tw:items-center tw:gap-[7px] tw:pt-[6px] tw:pr-[12px] tw:pb-[6px] tw:pl-[12px] tw:bg-staff-bg-nav tw:[border:1px_solid_var(--tw-color-staff-border-light)] tw:rounded-staff-md tw:text-staff-text-primary tw:font-staff tw:text-[12px] tw:font-semibold tw:cursor-pointer tw:[transition:all_0.15s_ease] tw:[&:hover]:bg-[#e2e8f0] tw:[&:hover]:text-[#0f172a]"} id="btn-return-inbox" title="Return to Conversations Workspace">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <line x1="19" y1="12" x2="5" y2="12">
    </line>
    <polyline points="12 19 5 12 12 5">
    </polyline>
    </svg>
    <span>{"Back to Inbox"}</span>
    </button>
    <div className={"topbar-divider tw:w-[1px] tw:h-[24px] tw:bg-staff-border-light"}>
    </div>
    <div className={"full-lookup-title-box tw:flex tw:flex-col tw:gap-[2px]"}>
    <h2 className={"full-lookup-heading tw:text-[15px] tw:font-bold tw:text-staff-text-primary tw:tracking-[-0.2px]"}>{"Policy Explorer & Dossier"}</h2>
    <span className={"full-lookup-subheading tw:text-[11px] tw:text-staff-text-muted"}>{"Search and review life insurance policies"}</span>
    </div>
    </div>

    </header>
    <div className={"full-lookup-content tw:flex-1 tw:flex tw:overflow-hidden tw:bg-[#f8fafc]"}>
    <aside className={"full-lookup-directory-pane tw:w-[380px] tw:shrink-0 tw:bg-white tw:[border-right:1px_solid_var(--tw-color-staff-border-light)] tw:flex tw:flex-col tw:overflow-hidden"}>
    <div className={"full-lookup-search-wrap tw:pt-[12px] tw:pr-[14px] tw:pb-[8px] tw:pl-[14px]"}>
    <div className={"full-lookup-search-box tw:flex tw:items-center tw:gap-[8px] tw:bg-[#f8fafc] tw:[border:1px_solid_var(--tw-color-staff-border-light)] tw:rounded-staff-md tw:pt-[7px] tw:pr-[11px] tw:pb-[7px] tw:pl-[11px] tw:[transition:all_0.15s_ease] tw:[&:focus-within]:bg-white tw:[&:focus-within]:[border-color:var(--tw-color-staff-border-focus)] tw:[&:focus-within]:[box-shadow:0_0_0_2px_rgba(59,_130,_246,_0.18)] tw:[&_svg]:text-staff-text-muted tw:[&_svg]:shrink-0 tw:[&_input]:w-full tw:[&_input]:border-none tw:[&_input]:outline-none tw:[&_input]:bg-transparent tw:[&_input]:font-staff tw:[&_input]:text-[12.5px] tw:[&_input]:text-staff-text-primary tw:[&_input::placeholder]:text-staff-text-muted"}>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="7">
    </circle>
    <line x1="21" y1="21" x2="16.5" y2="16.5">
    </line>
    </svg>
    <input disabled type="text" id="full-policy-search-input" placeholder="Search by Policy #, CCCD, phone, owner..." autoComplete="off"/>
    </div>
    </div>
    <div className={"full-lookup-filter-pills tw:flex tw:items-center tw:gap-[6px] tw:pt-[4px] tw:pr-[14px] tw:pb-[10px] tw:pl-[14px] tw:overflow-x-auto tw:[scrollbar-width:none] tw:[&::-webkit-scrollbar]:hidden"} id="full-policy-status-filters">
    <button disabled className={"status-filter-pill tw:shrink-0 tw:pt-[4px] tw:pr-[9px] tw:pb-[4px] tw:pl-[9px] tw:bg-[#f1f5f9] tw:[border:1px_solid_transparent] tw:rounded-staff-pill tw:font-staff tw:text-[11px] tw:font-medium tw:text-staff-text-secondary tw:cursor-pointer tw:[transition:all_0.15s_ease] tw:[&:hover]:bg-[#e2e8f0] tw:[&:hover]:text-staff-text-primary tw:[&.active]:bg-staff-brand-blue-soft tw:[&.active]:text-staff-brand-blue tw:[&.active]:[border-color:var(--tw-color-staff-brand-blue-border)] tw:[&.active]:font-semibold active"} data-filter="all">{"All"}</button>
    <button disabled className={"status-filter-pill tw:shrink-0 tw:pt-[4px] tw:pr-[9px] tw:pb-[4px] tw:pl-[9px] tw:bg-[#f1f5f9] tw:[border:1px_solid_transparent] tw:rounded-staff-pill tw:font-staff tw:text-[11px] tw:font-medium tw:text-staff-text-secondary tw:cursor-pointer tw:[transition:all_0.15s_ease] tw:[&:hover]:bg-[#e2e8f0] tw:[&:hover]:text-staff-text-primary tw:[&.active]:bg-staff-brand-blue-soft tw:[&.active]:text-staff-brand-blue tw:[&.active]:[border-color:var(--tw-color-staff-brand-blue-border)] tw:[&.active]:font-semibold"} data-filter="In-Force">{"In-Force"}</button>
    <button disabled className={"status-filter-pill tw:shrink-0 tw:pt-[4px] tw:pr-[9px] tw:pb-[4px] tw:pl-[9px] tw:bg-[#f1f5f9] tw:[border:1px_solid_transparent] tw:rounded-staff-pill tw:font-staff tw:text-[11px] tw:font-medium tw:text-staff-text-secondary tw:cursor-pointer tw:[transition:all_0.15s_ease] tw:[&:hover]:bg-[#e2e8f0] tw:[&:hover]:text-staff-text-primary tw:[&.active]:bg-staff-brand-blue-soft tw:[&.active]:text-staff-brand-blue tw:[&.active]:[border-color:var(--tw-color-staff-brand-blue-border)] tw:[&.active]:font-semibold"} data-filter="Grace Period">{"Grace Period"}</button>
    <button disabled className={"status-filter-pill tw:shrink-0 tw:pt-[4px] tw:pr-[9px] tw:pb-[4px] tw:pl-[9px] tw:bg-[#f1f5f9] tw:[border:1px_solid_transparent] tw:rounded-staff-pill tw:font-staff tw:text-[11px] tw:font-medium tw:text-staff-text-secondary tw:cursor-pointer tw:[transition:all_0.15s_ease] tw:[&:hover]:bg-[#e2e8f0] tw:[&:hover]:text-staff-text-primary tw:[&.active]:bg-staff-brand-blue-soft tw:[&.active]:text-staff-brand-blue tw:[&.active]:[border-color:var(--tw-color-staff-brand-blue-border)] tw:[&.active]:font-semibold"} data-filter="Review">{"Review"}</button>
    </div>
    <div className={"full-lookup-card-list tw:flex-1 tw:overflow-y-auto tw:pt-[4px] tw:pr-[12px] tw:pb-[16px] tw:pl-[12px] tw:flex tw:flex-col tw:gap-[8px] tw:[scrollbar-width:thin]"} id="full-policy-card-list">{slots.policiesList}</div>
    </aside>
    <section className={"full-lookup-dossier-pane tw:flex-1 tw:flex tw:flex-col tw:overflow-hidden tw:bg-[#f8fafc]"} id="full-lookup-dossier-pane">{slots.policyDossier}</section>
    </div>
    </section>
    </div>
    </div>

    </div>;
}
