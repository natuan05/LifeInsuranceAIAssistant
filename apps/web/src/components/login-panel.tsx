'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState, type FormEvent, type ReactNode } from 'react';
import { PasswordInput } from './password-input';

function Icon({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>;
}

const shield = <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />;
const arrow = <><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></>;
const lock = <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>;

export function LoginPanel({ staff, loading, pending, error, onSubmit }: {
  staff: boolean; loading: boolean; pending: boolean; error: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [showHelp, setShowHelp] = useState(false);
  const disabled = loading || pending;
  return <main className="tw:flex tw:min-h-dvh tw:items-center tw:justify-center tw:bg-[#dce7f6] tw:p-4 tw:font-login tw:text-slate-900 tw:antialiased tw:selection:bg-blue-100 tw:selection:text-blue-900 tw:sm:p-8">
    <div className="tw:grid tw:w-full tw:max-w-[1100px] tw:overflow-hidden tw:rounded-2xl tw:bg-white tw:shadow-[0_20px_50px_-10px_#0f172a26] tw:md:min-h-[620px] tw:md:grid-cols-[1.15fr_1fr]">
      <section className="tw:flex tw:min-w-0 tw:flex-col tw:justify-between tw:bg-linear-to-b tw:from-slate-50 tw:to-[#edf4fc] tw:p-6 tw:sm:p-9 tw:md:border-r tw:md:border-slate-200 tw:md:px-10" aria-label={staff ? 'AegisLife · Staff Portal' : 'AegisLife · Customer Portal'}>
        <Link href={staff ? '/staff/login' : '/login'} className="tw:flex tw:items-center tw:gap-3 tw:text-inherit tw:no-underline tw:focus-visible:outline-2 tw:focus-visible:outline-offset-4 tw:focus-visible:outline-blue-600">
          <span className="tw:flex tw:size-11 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-xl tw:bg-blue-600 tw:text-white"><Icon>{shield}</Icon></span>
          <span className="tw:min-w-0"><span className="tw:flex tw:flex-wrap tw:items-center tw:gap-2"><strong className="tw:text-xl tw:tracking-[-0.02em]">AegisLife</strong>{staff && <span className="tw:rounded-full tw:bg-indigo-100 tw:px-2 tw:py-1 tw:text-[10px] tw:font-semibold tw:text-indigo-800">Staff Portal</span>}</span><span className="tw:mt-1 tw:block tw:text-xs tw:leading-relaxed tw:text-slate-600">{staff ? 'Customer Support Portal' : 'Life Insurance Services'}</span></span>
        </Link>
        <div className="tw:hidden tw:flex-1 tw:items-center tw:justify-center tw:py-7 tw:md:flex">
          <Image src={staff ? '/images/staff-line-hero.png' : '/images/insurance-line-hero.png'} alt={staff ? 'A customer support specialist assisting customers' : 'A family with insurance and healthcare symbols'} width={500} height={500} sizes="(min-width: 768px) 460px, 1px" priority className="tw:h-auto tw:max-h-[400px] tw:w-full tw:object-contain" />
        </div>
        <div className="tw:hidden tw:md:block">
          <p className="tw:m-0 tw:mb-3 tw:text-sm tw:font-medium">{staff ? 'Supporting customers every day' : 'Care today. Peace of mind tomorrow.'}</p>
          <ul className="tw:m-0 tw:flex tw:list-none tw:flex-wrap tw:gap-x-5 tw:gap-y-3 tw:p-0 tw:text-xs tw:text-slate-600">
            <li className="tw:flex tw:items-center tw:gap-2"><Icon className="tw:size-4 tw:text-blue-600">{lock}</Icon>Personal account</li>
            <li className="tw:flex tw:items-center tw:gap-2"><Icon className="tw:size-4 tw:text-blue-600">{shield}</Icon>{staff ? 'Assigned support' : 'Personal profile'}</li>
          </ul>
        </div>
      </section>
      <section className="tw:flex tw:min-w-0 tw:flex-col tw:justify-center tw:px-6 tw:py-8 tw:sm:px-10 tw:md:px-12 tw:md:py-11" aria-labelledby="login-heading">
        <h1 id="login-heading" className="tw:m-0 tw:text-[26px] tw:leading-tight tw:font-semibold tw:tracking-[-0.025em]">{staff ? 'Staff Sign In' : 'Sign in to your account'}</h1>
        <p className="tw:mt-3 tw:mb-0 tw:text-sm tw:leading-7 tw:text-slate-600">{staff ? 'Access your workspace to view profiles and support your assigned customers.' : 'Welcome back. Sign in to view your profile and account information.'}</p>
        <form onSubmit={onSubmit} className="tw:mt-7 tw:grid tw:gap-5" aria-busy={disabled}>
          <div>
            <label htmlFor="email" className="tw:mb-2 tw:block tw:text-sm tw:font-medium">Email address <span className="tw:text-red-700" aria-hidden="true">*</span></label>
            <div className="tw:relative"><Icon className="tw:pointer-events-none tw:absolute tw:top-1/2 tw:left-3.5 tw:size-4 tw:-translate-y-1/2 tw:text-slate-500"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 6 9 7 9-7" /></Icon><input id="email" name="email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={254} placeholder={staff ? 'staff@example.com' : 'customer@example.com'} disabled={disabled} className="tw:box-border tw:h-12 tw:w-full tw:rounded-lg tw:border tw:border-solid tw:border-slate-300 tw:bg-white tw:pr-3 tw:pl-10 tw:font-[inherit] tw:text-sm tw:text-slate-900 tw:caret-blue-600 tw:outline-none tw:placeholder:text-slate-500 tw:focus:border-blue-600 tw:focus:ring-2 tw:focus:ring-blue-100 tw:disabled:opacity-60" /></div>
          </div>
          <div>
            <label htmlFor="password" className="tw:mb-2 tw:block tw:text-sm tw:font-medium">Password <span className="tw:text-red-700" aria-hidden="true">*</span></label>
            <PasswordInput id="password" label="Password" name="password" autoComplete="current-password" placeholder="Enter your password" required maxLength={128} disabled={disabled} appearance="login" />
          </div>
          <div className="tw:flex tw:justify-end"><button type="button" aria-expanded={showHelp} aria-controls="login-help" onClick={() => setShowHelp(value => !value)} className="tw:m-0 tw:w-auto tw:rounded tw:border-0 tw:bg-transparent tw:p-1 tw:font-[inherit] tw:text-xs tw:font-medium tw:text-blue-700 tw:hover:bg-blue-50 tw:focus-visible:outline-blue-600">Forgot password?</button></div>
          {showHelp && <p id="login-help" className="tw:m-0 tw:rounded-lg tw:bg-blue-50 tw:p-3 tw:text-xs tw:leading-6 tw:text-blue-900">Contact your administrator to reset your account password.</p>}
          {error && <p role="alert" className="tw:m-0 tw:rounded-lg tw:bg-red-50 tw:p-3 tw:text-sm tw:leading-6 tw:text-red-800">{error}</p>}
          <button type="submit" disabled={disabled} className="tw:flex tw:h-12 tw:w-full tw:items-center tw:justify-center tw:gap-3 tw:rounded-lg tw:border-0 tw:bg-blue-600 tw:px-4 tw:py-3 tw:font-[inherit] tw:text-sm tw:font-semibold tw:text-white tw:transition-colors tw:hover:bg-blue-700 tw:focus-visible:outline-blue-600 tw:disabled:cursor-wait tw:disabled:opacity-60"><span aria-live="polite">{loading ? 'Checking your session…' : pending ? 'Signing in…' : staff ? 'Sign in' : 'Sign in'}</span><Icon className="tw:size-4">{arrow}</Icon></button>
        </form>
        <p className="tw:mt-5 tw:mb-0 tw:text-xs tw:leading-6 tw:text-slate-600">Use the email address and password provided to you.</p>
        <div className="tw:mt-7 tw:border-t tw:border-slate-200 tw:pt-5 tw:text-center tw:text-xs tw:leading-6 tw:text-slate-600">
          <span className="tw:block">{staff ? 'Are you an insurance customer?' : 'Are you a customer support specialist?'}</span>
          <Link href={staff ? '/login' : '/staff/login'} className="tw:mt-1 tw:inline-flex tw:min-h-10 tw:items-center tw:gap-2 tw:font-semibold tw:text-blue-700 tw:no-underline tw:underline-offset-4 tw:hover:underline tw:focus-visible:outline-blue-600">{staff ? 'Customer Portal' : 'Staff Portal'}<Icon className="tw:size-4">{arrow}</Icon></Link>
        </div>
      </section>
    </div>
  </main>;
}
