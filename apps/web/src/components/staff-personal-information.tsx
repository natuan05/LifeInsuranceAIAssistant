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

    return (
      <section className="tw:flex-1 tw:min-w-0 tw:overflow-auto tw:bg-slate-50" aria-labelledby="personal-page-title">
        <header className="tw:border-b tw:border-slate-200/80 tw:bg-white tw:px-6 tw:py-3.5 tw:shadow-2xs">
          <h1 id="personal-page-title" className="tw:text-lg tw:font-bold tw:text-slate-900 tw:m-0">Personal information</h1>
          <p className="tw:mt-0.5 tw:text-xs tw:text-slate-500 tw:m-0">Your account details and sign-in security.</p>
        </header>
        <div className="tw:p-6 tw:max-w-4xl tw:grid tw:grid-cols-1 tw:lg:grid-cols-3 tw:gap-5 tw:items-start">
          <section className="tw:lg:col-span-2 tw:rounded-2xl tw:border tw:border-slate-200/80 tw:bg-white tw:overflow-hidden tw:shadow-2xs">
            <div className="tw:flex tw:items-center tw:gap-3.5 tw:p-4 tw:sm:p-5 tw:border-b tw:border-slate-100">
              <span className="tw:grid tw:place-items-center tw:w-11 tw:h-11 tw:shrink-0 tw:rounded-xl tw:bg-blue-100 tw:text-blue-700 tw:text-base tw:font-bold">
                {actor.fullName.slice(0, 1)}
              </span>
              <div>
                <h2 className="tw:text-base tw:font-bold tw:text-slate-900 tw:m-0">{actor.fullName}</h2>
                <span className="tw:inline-flex tw:mt-1 tw:px-2 tw:py-0.5 tw:bg-blue-50 tw:rounded-md tw:text-blue-700 tw:text-[11px] tw:font-semibold">Staff</span>
              </div>
            </div>
            <dl className="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-4 tw:p-4 tw:sm:p-5 tw:border-b tw:border-slate-100">
              {[['Full name', actor.fullName], ['Email address', actor.email], ['Account code', actor.accountCode], ['Role', 'Staff']].map(([label, value]) => (
                <div key={label}>
                  <dt className="tw:text-[11px] tw:font-medium tw:text-slate-500 tw:mb-0.5">{label}</dt>
                  <dd className="tw:text-xs tw:font-semibold tw:text-slate-900 tw:break-words tw:m-0">{value}</dd>
                </div>
              ))}
            </dl>
            <StaffProfileEditor key={actor.id} actorId={actor.id}/>
          </section>
          <section className="tw:lg:col-span-1 tw:rounded-2xl tw:border tw:border-slate-200/80 tw:bg-white tw:p-5 tw:shadow-2xs" aria-labelledby="security-title">
            <div className="tw:flex tw:items-center tw:gap-2.5 tw:mb-3.5">
              <span className="tw:w-8 tw:h-8 tw:grid tw:place-items-center tw:bg-blue-50 tw:rounded-lg tw:text-blue-600 tw:shrink-0">
                <StaffIcon kind="shield" size={18}/>
              </span>
              <div>
                <h2 id="security-title" className="tw:text-sm tw:font-bold tw:text-slate-900 tw:m-0">Security</h2>
                <p className="tw:text-[11px] tw:text-slate-500 tw:mt-0.5 tw:m-0">Manage your sign-in password.</p>
              </div>
            </div>
            {passwordOpen ? (
              <div id="personal-password-editor">
                {children}
                <button 
                  className="tw:flex tw:justify-center tw:w-full tw:mt-2.5 tw:p-2 tw:text-slate-500 tw:text-xs tw:font-medium tw:rounded-lg tw:hover:bg-slate-50 tw:hover:text-slate-800 tw:cursor-pointer tw:transition-colors" 
                  onClick={() => { 
                    setPasswordOpen(false); 
                    requestAnimationFrame(() => toggle.current?.focus()); 
                    if (window.location.hash === '#change-password')
                      history.replaceState(history.state, '', window.location.pathname + window.location.search); 
                  }}>
                  Cancel
                </button>
              </div>
            ) : (
              <div className="tw:mb-4">
                <h3 className="tw:text-xs tw:font-semibold tw:text-slate-800 tw:mb-1">Password</h3>
                <p className="tw:text-[11px] tw:text-slate-500 tw:leading-relaxed">Change your password whenever you need to keep your account secure.</p>
              </div>
            )}
            <button 
              ref={toggle} 
              className="tw:flex tw:w-full tw:items-center tw:justify-between tw:gap-2 tw:px-3 tw:py-2 tw:bg-white tw:border tw:border-slate-200 tw:rounded-xl tw:text-slate-700 tw:text-xs tw:font-semibold tw:hover:bg-slate-50 tw:hover:border-blue-300 tw:hover:text-blue-700 tw:transition-colors tw:cursor-pointer tw:[&[hidden]]:hidden" 
              aria-expanded={passwordOpen} 
              aria-controls="personal-password-editor" 
              hidden={passwordOpen} 
              onClick={() => setPasswordOpen(true)}>
              Change password
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>
            </button>
          </section>
        </div>
      </section>
    );
}
