'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { Actor } from '@/lib/auth-api';

export function StaffIcon({ kind, size = 18 }: {
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
        if (!open) return;
        const outside = (e: PointerEvent) => {
            if (!root.current?.contains(e.target as Node)) setOpen(false);
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

    return <div className={"nav-col-footer account-anchor tw:relative tw:mt-auto tw:shrink-0 tw:p-3 tw:border-t tw:border-slate-200/80"} ref={root}>
    {open && <nav id="staff-account-actions" aria-label="Account options" className={"account-popover tw:absolute tw:bottom-[calc(100%_+_8px)] tw:left-2 tw:w-[240px] tw:max-w-[calc(100vw_-_24px)] tw:bg-white tw:border tw:border-slate-200/80 tw:rounded-2xl tw:shadow-xl tw:p-1.5 tw:z-50 tw:animate-in tw:fade-in-50 tw:zoom-in-95"}><div className={"account-popover-heading tw:px-3 tw:py-2.5 tw:border-b tw:border-slate-100 tw:mb-1"}><strong className="tw:block tw:text-xs tw:font-bold tw:text-slate-900 tw:truncate">{actor.fullName}</strong><span className="tw:block tw:text-[11px] tw:text-slate-500 tw:truncate tw:mt-0.5">{actor.email}</span></div><Link href="/account" onClick={() => setOpen(false)} className="tw:flex tw:items-center tw:gap-2.5 tw:w-full tw:px-3 tw:py-2 tw:rounded-xl tw:text-xs tw:font-medium tw:text-slate-700 tw:hover:bg-slate-100 tw:transition-colors tw:no-underline"><StaffIcon kind="users" size={16}/><span>Personal information</span></Link><div className={"account-menu-divider tw:h-px tw:bg-slate-100 tw:my-1"}/><button onClick={onSignOut} disabled={pending} className={"account-signout tw:flex tw:items-center tw:gap-2.5 tw:w-full tw:px-3 tw:py-2 tw:rounded-xl tw:text-xs tw:font-medium tw:text-rose-600 tw:hover:bg-rose-50 tw:transition-colors tw:cursor-pointer tw:disabled:opacity-50"}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M9 3H3v18h6m5-14 5 5-5 5M8 12h13"/></svg><span>{pending ? 'Signing out…' : 'Sign out'}</span></button></nav>}
    
    <button ref={trigger} className={"staff-card account-trigger tw:flex tw:items-center tw:w-full tw:gap-2.5 tw:p-1.5 tw:rounded-xl tw:bg-transparent tw:hover:bg-slate-100/80 tw:transition-all tw:cursor-pointer tw:text-left tw:border-0 " + (open ? "is-open tw:bg-slate-100/80" : "")} onClick={() => setOpen(v => !v)} aria-expanded={open} aria-controls="staff-account-actions" aria-label="Open account options">
      <span className={"staff-avatar-box tw:relative tw:w-9 tw:h-9 tw:shrink-0"}>
        <span className={"initial-avatar tw:grid tw:place-items-center tw:w-9 tw:h-9 tw:rounded-full tw:bg-gradient-to-tr tw:from-indigo-500 tw:via-purple-500 tw:to-blue-600 tw:text-white tw:text-xs tw:font-bold tw:shadow-2xs"}>
          {actor.fullName.slice(0, 1)}
        </span>
      </span>
      <span className={"staff-card-text tw:flex tw:flex-col tw:min-w-0 tw:flex-1 tw:[.inbox-nav-col.collapsed_&]:hidden"}>
        <span className={"staff-name tw:text-xs tw:font-bold tw:text-slate-900 tw:truncate tw:leading-snug"}>{actor.fullName}</span>
        <span className={"staff-role tw:text-[11px] tw:text-slate-500 tw:truncate tw:leading-snug"}>{actor.role === 'STAFF' ? 'Support Specialist' : actor.role}</span>
      </span>
      <svg className={"account-chevron tw:text-slate-400 tw:shrink-0 tw:transition-transform tw:[.inbox-nav-col.collapsed_&]:hidden " + (open ? "tw:rotate-180" : "")} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
    </button>
  </div>;
}
