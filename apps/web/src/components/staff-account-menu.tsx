'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { Actor } from '@/lib/auth-api';
export function StaffIcon({ kind, size = 20 }: {
    kind: string;
    size?: number;
}) {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{kind === 'search' ? <><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/></> : kind === 'shield' ? <path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6Z"/> : kind === 'users' ? <><circle cx="9" cy="7" r="3"/><path d="M3 21v-4a6 6 0 0 1 12 0v4m3-17a3 3 0 0 1 0 6m2 4a5 5 0 0 1 2 4v3"/></> : kind === 'chat' ? <path d="M3 4h18v13H8l-5 4Z"/> : kind === 'star' ? <path d="m12 2 3 6 7 1-5 5 1 8-6-4-6 4 1-8-5-5 7-1Z"/> : kind === 'panel' ? <><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/></> : <><path d="M5 2h10l4 4v16H5Z"/><path d="M9 10h6m-6 4h6m-6 4h4"/></>}</svg>;
}
export function AccountMenu({ actor, pending, onSignOut }: {
    actor: Actor;
    pending: boolean;
    onSignOut: () => void;
}) {
    const [open, setOpen] = useState(false);
    const root = useRef<HTMLDivElement>(null);
    const trigger = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        if (!open)
            return;
        const outside = (e: PointerEvent) => {
            if (!root.current?.contains(e.target as Node))
                setOpen(false);
        };
        const escape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setOpen(false);
                trigger.current?.focus();
            }
        };
        document.addEventListener('pointerdown', outside);
        document.addEventListener('keydown', escape);
        return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
    }, [open]);
    return <div className={"nav-col-footer tw:[.inbox-nav-col.collapsed_&]:flex tw:[.inbox-nav-col.collapsed_&]:justify-center tw:[.inbox-nav-col.collapsed_&]:items-center tw:[.inbox-nav-col.collapsed_&]:pt-[8px] tw:[.inbox-nav-col.collapsed_&]:pr-[8px] tw:[.inbox-nav-col.collapsed_&]:pb-[8px] tw:[.inbox-nav-col.collapsed_&]:pl-[8px] tw:mt-[auto] tw:shrink-0 tw:pt-[10px] tw:pr-[12px] tw:pb-[14px] tw:pl-[12px] tw:[border-top:1px_solid_#eaecf0] tw:max-[1000px]:w-full account-anchor tw:relative tw:overflow-visible tw:max-[1000px]:max-w-[280px]"} ref={root}>
    {open && <nav id="staff-account-actions" aria-label="Account options" className={"account-popover tw:absolute tw:bottom-[calc(100%_+_6px)] tw:left-[10px] tw:w-[250px] tw:max-w-[calc(100vw_-_20px)] tw:pt-[6px] tw:pr-[6px] tw:pb-[6px] tw:pl-[6px] tw:bg-white tw:[border:1px_solid_#e2e8f0] tw:rounded-[10px] tw:[box-shadow:0_10px_30px_#0f172a1a] tw:z-[1000] tw:[&_a]:flex tw:[&_a]:items-center tw:[&_a]:gap-[10px] tw:[&_a]:w-full tw:[&_a]:box-border tw:[&_a]:pt-[10px] tw:[&_a]:pr-[10px] tw:[&_a]:pb-[10px] tw:[&_a]:pl-[10px] tw:[&_a]:rounded-[6px] tw:[&_a]:text-[#334155] tw:[&_a]:no-underline tw:[&_a]:font-[inherit] tw:[&_a]:text-[12px] tw:[&_a]:justify-start tw:[&_a]:text-left tw:[&_button]:flex tw:[&_button]:items-center tw:[&_button]:gap-[10px] tw:[&_button]:w-full tw:[&_button]:box-border tw:[&_button]:pt-[10px] tw:[&_button]:pr-[10px] tw:[&_button]:pb-[10px] tw:[&_button]:pl-[10px] tw:[&_button]:rounded-[6px] tw:[&_button]:text-[#334155] tw:[&_button]:no-underline tw:[&_button]:font-[inherit] tw:[&_button]:text-[12px] tw:[&_button]:justify-start tw:[&_button]:text-left tw:[&_a:hover]:bg-[#f1f5f9] tw:[&_button:hover]:bg-[#f1f5f9] tw:max-[1000px]:bottom-[auto] tw:max-[1000px]:top-[calc(100%_-_8px)]"}><div className={"account-popover-heading tw:pt-[10px] tw:pr-[10px] tw:pb-[12px] tw:pl-[10px] tw:flex tw:flex-col tw:gap-[5px] tw:[border-bottom:1px_solid_#eaecf0] tw:mb-[5px] tw:text-[12px] tw:[&_span]:text-[10.5px] tw:[&_span]:text-[#64748b] tw:[&_span]:wrap-anywhere"}><strong>{actor.fullName}</strong><span>{actor.email}</span></div><Link href="/account" onClick={() => setOpen(false)}><StaffIcon kind="users" size={17}/>Personal information</Link><div className={"account-menu-divider tw:h-[1px] tw:bg-[#eaecf0] tw:mt-[5px] tw:mr-[5px] tw:mb-[5px] tw:ml-[5px]"}/><button onClick={onSignOut} disabled={pending} className={"account-signout tw:[.account-popover_&]:text-[#b42318]"}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M9 3H3v18h6m5-14 5 5-5 5M8 12h13"/></svg>{pending ? 'Signing out…' : 'Sign out'}</button></nav>}
    <button ref={trigger} className={"staff-card tw:[.inbox-nav-col.collapsed_&]:w-[34px] tw:[.inbox-nav-col.collapsed_&]:h-[34px] tw:[.inbox-nav-col.collapsed_&]:mt-[0] tw:[.inbox-nav-col.collapsed_&]:mr-[auto] tw:[.inbox-nav-col.collapsed_&]:mb-[0] tw:[.inbox-nav-col.collapsed_&]:ml-[auto] tw:[.inbox-nav-col.collapsed_&]:flex tw:[.inbox-nav-col.collapsed_&]:items-center tw:[.inbox-nav-col.collapsed_&]:rounded-staff-md tw:flex tw:items-center tw:cursor-pointer tw:[transition:background_0.15s_ease] account-trigger tw:w-full tw:gap-[9px] tw:pt-[8px] tw:pr-[8px] tw:pb-[8px] tw:pl-[8px] tw:justify-start tw:bg-transparent tw:text-left tw:rounded-[8px] tw:min-h-[48px] tw:[&:hover]:bg-[#e9edf2] tw:[&.is-open]:bg-[#e9edf2] tw:[.inbox-nav-col.collapsed_&]:p-0 tw:[.inbox-nav-col.collapsed_&]:justify-center " + (open ? "is-open" : "")} onClick={() => setOpen(v => !v)} aria-expanded={open} aria-controls="staff-account-actions" aria-label="Open account options"><span className={"staff-avatar-box tw:[.inbox-nav-col.collapsed_&]:w-[30px] tw:[.inbox-nav-col.collapsed_&]:h-[30px] tw:relative tw:w-[32px] tw:h-[32px] tw:rounded-[50%] tw:shrink-0"}><span className={"initial-avatar tw:[.account-trigger_&]:w-[32px] tw:[.account-trigger_&]:h-[32px] tw:[.account-trigger_&]:text-[13px] tw:grid tw:place-items-center tw:w-[32px] tw:h-[32px] tw:rounded-[50%] tw:bg-[#dbeafe] tw:text-[#1e40af] tw:text-[13px]"}>{actor.fullName.slice(0, 1)}</span></span><span className={"staff-card-text tw:[.inbox-nav-col.collapsed_&]:hidden! tw:flex tw:flex-col tw:min-w-0 tw:[.account-trigger_&]:flex-1 tw:[.account-trigger_&]:min-w-0 tw:[.account-trigger_&]:gap-[3px]"}><span className={"staff-name tw:text-[12.5px] tw:font-semibold tw:text-staff-text-primary tw:leading-[1.2] tw:[.account-trigger_&]:text-[12px] tw:[.account-trigger_&]:leading-[17px] tw:[.account-trigger_&]:overflow-hidden tw:[.account-trigger_&]:text-ellipsis tw:[.account-trigger_&]:whitespace-nowrap"}>{actor.fullName}</span><span className={"staff-role tw:text-[10.5px] tw:text-staff-text-muted tw:[.account-trigger_&]:text-[10.5px] tw:[.account-trigger_&]:leading-[15px] tw:[.account-trigger_&]:text-[#64748b]"}>{actor.accountCode}</span></span><svg className={"account-chevron tw:text-[#64748b] tw:[.inbox-nav-col.collapsed_&]:hidden"} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d={open ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6'}/></svg></button>
  </div>;
}
