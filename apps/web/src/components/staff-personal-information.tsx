 'use client';
import { useEffect,useRef,useState,type ReactNode } from 'react';
import type { Actor } from '@/lib/auth-api';
import { StaffIcon } from './staff-account-menu';

export function StaffPersonalInformation({actor,children}:{actor:Actor;children:ReactNode}) {
  const [passwordOpen,setPasswordOpen]=useState(false);
  const toggle=useRef<HTMLButtonElement>(null);
  useEffect(()=>{
    const show=()=>{if(window.location.hash==='#change-password')setPasswordOpen(true);};
    show();window.addEventListener('hashchange',show);return()=>window.removeEventListener('hashchange',show);
  },[]);
  return <section className="personal-page" aria-labelledby="personal-page-title">
    <header className="personal-page-header"><h1 id="personal-page-title">Personal information</h1><p>Your account details and sign-in security.</p></header>
    <div className="personal-page-body"><section className="personal-details-card"><div className="personal-identity"><span className="personal-avatar">{actor.fullName.slice(0,1)}</span><div><h2>{actor.fullName}</h2><span className="personal-role">Staff</span></div></div><dl className="personal-fields">{[['Full name',actor.fullName],['Email address',actor.email],['Account code',actor.accountCode],['Role','Staff']].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><div className="personal-admin-note"><StaffIcon kind="users" size={16}/><p>Contact your administrator to update your account details.</p></div></section>
    <section className="personal-security-card" aria-labelledby="security-title"><div className="personal-security-heading"><span className="personal-security-icon"><StaffIcon kind="shield" size={20}/></span><div><h2 id="security-title">Security</h2><p>Manage your sign-in password.</p></div></div>
      {passwordOpen?<div id="personal-password-editor">{children}<button className="personal-cancel" onClick={()=>{setPasswordOpen(false);requestAnimationFrame(()=>toggle.current?.focus());if(window.location.hash==='#change-password')history.replaceState(history.state,'',window.location.pathname+window.location.search);}}>Cancel</button></div>:<div className="personal-password-summary"><h3>Password</h3><p>Change your password whenever you need to keep your account secure.</p></div>}
      <button ref={toggle} className="personal-password-toggle" aria-expanded={passwordOpen} aria-controls="personal-password-editor" hidden={passwordOpen} onClick={()=>setPasswordOpen(true)}>Change password<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg></button>
    </section></div>
  </section>;
}
