'use client';
import Link from 'next/link';
import { useEffect,useRef,useState } from 'react';
import type { Actor } from '@/lib/auth-api';
export function StaffIcon({kind,size=20}:{kind:string;size?:number}) {
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{kind==='search'?<><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/></>:kind==='shield'?<path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6Z"/>:kind==='users'?<><circle cx="9" cy="7" r="3"/><path d="M3 21v-4a6 6 0 0 1 12 0v4m3-17a3 3 0 0 1 0 6m2 4a5 5 0 0 1 2 4v3"/></>:kind==='chat'?<path d="M3 4h18v13H8l-5 4Z"/>:kind==='star'?<path d="m12 2 3 6 7 1-5 5 1 8-6-4-6 4 1-8-5-5 7-1Z"/>:kind==='panel'?<><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/></>:<><path d="M5 2h10l4 4v16H5Z"/><path d="M9 10h6m-6 4h6m-6 4h4"/></>}</svg>;
}

export function AccountMenu({actor,pending,onSignOut}:{actor:Actor;pending:boolean;onSignOut:()=>void}) {
  const [open,setOpen]=useState(false);
  const root=useRef<HTMLDivElement>(null);
  const trigger=useRef<HTMLButtonElement>(null);
  useEffect(()=>{
    if(!open)return;
    const outside=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node))setOpen(false);};
    const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){setOpen(false);trigger.current?.focus();}};
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
    return ()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
  },[open]);
  return <div className="nav-col-footer account-anchor" ref={root}>
    {open&&<nav id="staff-account-actions" aria-label="Account options" className="account-popover"><div className="account-popover-heading"><strong>{actor.fullName}</strong><span>{actor.email}</span></div><Link href="/account" onClick={()=>setOpen(false)}><StaffIcon kind="users" size={17}/>Personal information</Link><div className="account-menu-divider"/><button onClick={onSignOut} disabled={pending} className="account-signout"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M9 3H3v18h6m5-14 5 5-5 5M8 12h13"/></svg>{pending?'Signing out…':'Sign out'}</button></nav>}
    <button ref={trigger} className={'staff-card account-trigger '+(open?'is-open':'')} onClick={()=>setOpen(v=>!v)} aria-expanded={open} aria-controls="staff-account-actions" aria-label="Open account options"><span className="staff-avatar-box"><span className="initial-avatar">{actor.fullName.slice(0,1)}</span></span><span className="staff-card-text"><span className="staff-name">{actor.fullName}</span><span className="staff-role">{actor.accountCode}</span></span><svg className="account-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d={open?'m6 15 6-6 6 6':'m6 9 6 6 6-6'}/></svg></button>
  </div>;
}

