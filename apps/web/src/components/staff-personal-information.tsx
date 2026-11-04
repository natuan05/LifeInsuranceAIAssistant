'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Actor } from '@/lib/auth-api';
import { StaffIcon } from './staff-account-menu';
import { StaffProfileEditor } from './staff-profile-editor';
export function StaffPersonalInformation({ actor, children }: {
    actor: Actor;
    children: ReactNode;
}) {
    const [passwordOpen, setPasswordOpen] = useState(false);
    const toggle = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        const show = () => { if (window.location.hash === '#change-password')
            setPasswordOpen(true); };
        show();
        window.addEventListener('hashchange', show);
        return () => window.removeEventListener('hashchange', show);
    }, []);
    return <section className={"tw:flex-1 tw:min-w-0 tw:overflow-auto tw:bg-[#f8fafc]"} aria-labelledby="personal-page-title">
    <header className={"tw:[padding:27px_30px_24px] tw:bg-white tw:[border-bottom:1px_solid_#eaecf0] tw:[&_h1]:text-[21px] tw:[&_h1]:leading-[30px] tw:[&_h1]:tracking-[-.3px] tw:[&_h1]:m-0 tw:[&_p]:text-[12px] tw:[&_p]:leading-[20px] tw:[&_p]:text-[#64748b] tw:[&_p]:mt-[5px] tw:max-[600px]:[padding:20px_18px]"}><h1 id="personal-page-title">Personal information</h1><p>Your account details and sign-in security.</p></header>
    <div className="tw:grid tw:[grid-template-columns:minmax(0,1fr)_360px] tw:gap-6 tw:max-w-[1160px] tw:[padding:28px_30px] tw:items-start tw:max-[1200px]:[grid-template-columns:minmax(0,1fr)_320px] tw:max-[1200px]:gap-[18px] tw:max-[850px]:[grid-template-columns:1fr] tw:max-[850px]:max-w-[720px] tw:max-[600px]:[padding:18px] tw:max-[600px]:gap-4">
      <section className="tw:[border:1px_solid_#e2e8f0] tw:rounded-[10px] tw:bg-white tw:min-w-0 tw:overflow-hidden">
        <div className="tw:flex tw:items-center tw:gap-[14px] tw:p-6 tw:[border-bottom:1px_solid_#edf1f5] tw:[&_h2]:text-[16px] tw:[&_h2]:leading-[24px] tw:[&_h2]:m-0 tw:[&_h2]:[overflow-wrap:anywhere] tw:max-[600px]:p-5">
          <span className="tw:grid tw:place-items-center tw:w-[52px] tw:h-[52px] tw:shrink-0 tw:rounded-[14px] tw:bg-[#dbeafe] tw:text-[#1d4ed8] tw:text-[21px] tw:font-semibold">{actor.fullName.slice(0, 1)}</span>
          <div><h2>{actor.fullName}</h2><span className="tw:[display:inline-flex] tw:mt-[6px] tw:[padding:2px_7px] tw:bg-[#eff6ff] tw:rounded-[5px] tw:text-[#2563eb] tw:text-[10.5px] tw:leading-[17px]">Staff</span></div>
        </div>
        <dl className="tw:grid tw:[grid-template-columns:1fr_1fr] tw:gap-[26px_24px] tw:p-6 tw:[&>div]:min-w-0 tw:[&_dt]:text-[11px] tw:[&_dt]:text-[#64748b] tw:[&_dt]:mb-[7px] tw:[&_dd]:text-[12.5px] tw:[&_dd]:leading-[21px] tw:[&_dd]:[overflow-wrap:anywhere] tw:max-[600px]:[grid-template-columns:1fr] tw:max-[600px]:p-5 tw:max-[600px]:gap-[18px]">
          {[['Full name', actor.fullName], ['Email address', actor.email], ['Account code', actor.accountCode], ['Role', 'Staff']].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>
        <StaffProfileEditor key={actor.id} actorId={actor.id}/>
      </section>
    <section className={"tw:[border:1px_solid_#e2e8f0] tw:rounded-[10px] tw:bg-white tw:min-w-0 tw:overflow-hidden tw:[padding:22px] tw:max-[850px]:max-w-[none]"} aria-labelledby="security-title"><div className={"tw:flex tw:items-center tw:gap-[11px] tw:mb-[24px] tw:[&_h2]:text-[14px] tw:[&_h2]:leading-[21px] tw:[&_h2]:m-0 tw:[&_p]:text-[11px] tw:[&_p]:text-[#64748b] tw:[&_p]:mt-[3px] tw:[&_p]:leading-[18px]"}><span className={"tw:w-[36px] tw:h-[36px] tw:grid tw:place-items-center tw:bg-[#eff6ff] tw:rounded-[9px] tw:text-[#2563eb] tw:shrink-0"}><StaffIcon kind="shield" size={20}/></span><div><h2 id="security-title">Security</h2><p>Manage your sign-in password.</p></div></div>
      {passwordOpen ? <div id="personal-password-editor">{children}<button className={"tw:flex tw:justify-center tw:w-full tw:mt-[10px] tw:[padding:8px] tw:text-[#64748b] tw:text-[12px] tw:rounded-[6px] tw:[&:hover]:bg-[#f8fafc] tw:[&:hover]:text-[#334155]"} onClick={() => { setPasswordOpen(false); requestAnimationFrame(() => toggle.current?.focus()); if (window.location.hash === '#change-password')
        history.replaceState(history.state, '', window.location.pathname + window.location.search); }}>Cancel</button></div> : <div className={"tw:[&_h3]:text-[12px] tw:[&_h3]:font-medium tw:[&_h3]:mb-[7px] tw:[&_p]:text-[11.5px] tw:[&_p]:text-[#64748b] tw:[&_p]:leading-[20px] tw:[&_p]:mb-[18px]"}><h3>Password</h3><p>Change your password whenever you need to keep your account secure.</p></div>}
      <button ref={toggle} className={"tw:flex tw:w-full tw:items-center tw:justify-between tw:gap-[12px] tw:[padding:10px_12px] tw:bg-white tw:[border:1px_solid_#dbe3ef] tw:rounded-[7px] tw:text-[#334155] tw:font-[inherit] tw:text-[12px] tw:[&:hover]:bg-[#f8fafc] tw:[&:hover]:[border-color:#bfdbfe] tw:[&:hover]:text-[#2563eb] tw:[&[hidden]]:hidden"} aria-expanded={passwordOpen} aria-controls="personal-password-editor" hidden={passwordOpen} onClick={() => setPasswordOpen(true)}>Change password<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg></button>
    </section></div>
  </section>;
}
