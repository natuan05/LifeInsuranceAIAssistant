'use client';

import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react';

export function PasswordInput({ label, id, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { id: string; label: string }) {
  const [visible, setVisible] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const form = input.current?.form;
    const hide = () => setVisible(false);
    form?.addEventListener('reset', hide);
    return () => form?.removeEventListener('reset', hide);
  }, []);
  const action = `${visible ? 'Ẩn' : 'Hiện'} ${label.toLowerCase()}`;
  return <div className="password-input">
    <input {...props} id={id} ref={input} type={visible ? 'text' : 'password'} />
    <button className="password-toggle" type="button" aria-label={action} title={action}
      aria-controls={id} aria-pressed={visible} disabled={props.disabled} onClick={() => setVisible(value => !value)}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
        {visible && <path d="m3 3 18 18" />}
      </svg>
    </button>
  </div>;
}
