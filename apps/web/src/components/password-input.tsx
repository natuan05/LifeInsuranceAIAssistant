'use client';

import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react';

export function PasswordInput({ label, id, appearance, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { id: string; label: string; appearance?: 'login' }) {
  const [visible, setVisible] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const form = input.current?.form;
    const hide = () => setVisible(false);
    form?.addEventListener('reset', hide);
    return () => form?.removeEventListener('reset', hide);
  }, []);
  const action = `${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`;
  return <div className={appearance === 'login' ? 'tw:relative' : 'password-input'}>
    <input {...props} id={id} ref={input} type={visible ? 'text' : 'password'} className={appearance === 'login' ? 'tw:box-border tw:h-12 tw:w-full tw:rounded-lg tw:border tw:border-solid tw:border-slate-300 tw:bg-white tw:pr-14 tw:pl-3.5 tw:font-[inherit] tw:text-sm tw:text-slate-900 tw:caret-blue-600 tw:outline-none tw:placeholder:text-slate-500 tw:focus:border-blue-600 tw:focus:ring-2 tw:focus:ring-blue-100 tw:disabled:opacity-60' : props.className} />
    <button className={appearance === 'login' ? 'tw:absolute tw:top-1/2 tw:right-1 tw:m-0 tw:flex tw:size-10 tw:-translate-y-1/2 tw:items-center tw:justify-center tw:rounded-md tw:border-0 tw:bg-transparent tw:p-0 tw:text-slate-600 tw:hover:bg-blue-50 tw:focus-visible:outline-blue-600 tw:disabled:cursor-wait' : 'password-toggle'} type="button" aria-label={action} title={action}
      aria-controls={id} aria-pressed={visible} disabled={props.disabled} onClick={() => setVisible(value => !value)}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
        {visible && <path d="m3 3 18 18" />}
      </svg>
    </button>
  </div>;
}
