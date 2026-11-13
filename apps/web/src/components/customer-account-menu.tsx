'use client';

import { useEffect, useRef, useState } from 'react';
import type { Actor } from '@/lib/auth-api';

export function CustomerAccountMenu({
  actor,
  pending,
  collapsed = false,
  isProfile = false,
  onSelectProfile,
  onSignOut,
}: {
  actor: Actor;
  pending: boolean;
  collapsed?: boolean;
  isProfile?: boolean;
  onSelectProfile: () => void;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  const initial = actor.fullName.trim() ? actor.fullName.trim().slice(0, 1).toUpperCase() : 'C';

  return (
    <div
      className="nav-col-footer account-anchor tw:relative tw:mt-auto tw:shrink-0 tw:p-3 tw:border-t tw:border-slate-200/80 tw:bg-white"
      ref={root}
    >
      {open && (
        <nav
          id="customer-account-actions"
          aria-label="Account options"
          className="account-popover tw:absolute tw:bottom-[calc(100%_+_8px)] tw:left-2 tw:w-[240px] tw:max-w-[calc(100vw_-_24px)] tw:bg-white tw:border tw:border-slate-200/80 tw:rounded-2xl tw:shadow-xl tw:p-1.5 tw:z-50 tw:animate-in tw:fade-in-50 tw:zoom-in-95"
        >
          {/* Header Profile Info */}
          <div className="account-popover-heading tw:px-3 tw:py-2.5 tw:border-b tw:border-slate-100 tw:mb-1">
            <strong className="tw:block tw:text-xs tw:font-bold tw:text-slate-900 tw:truncate">
              {actor.fullName}
            </strong>
            <span className="tw:block tw:text-[11px] tw:text-slate-500 tw:truncate tw:mt-0.5">
              {actor.email}
            </span>
          </div>

          {/* Action 1: Personal profile & security */}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onSelectProfile();
            }}
            className="tw:flex tw:items-center tw:gap-2.5 tw:w-full tw:px-3 tw:py-2 tw:rounded-xl tw:text-xs tw:font-medium tw:text-slate-700 tw:hover:bg-slate-100 tw:transition-colors tw:cursor-pointer tw:text-left"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="tw:text-slate-500"
              aria-hidden="true"
            >
              <circle cx="12" cy="7" r="4" />
              <path d="M4 21v-4a8 8 0 0 1 16 0v4" />
            </svg>
            <span>Personal information</span>
          </button>

          <div className="account-menu-divider tw:h-px tw:bg-slate-100 tw:my-1" />

          {/* Action 2: Sign Out */}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
            disabled={pending}
            className="account-signout tw:flex tw:items-center tw:gap-2.5 tw:w-full tw:px-3 tw:py-2 tw:rounded-xl tw:text-xs tw:font-medium tw:text-rose-600 tw:hover:bg-rose-50 tw:transition-colors tw:cursor-pointer tw:disabled:opacity-50 tw:text-left"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 3H3v18h6m5-14 5 5-5 5M8 12h13" />
            </svg>
            <span>{pending ? 'Signing out…' : 'Sign out'}</span>
          </button>
        </nav>
      )}

      {/* Trigger Button */}
      <button
        ref={trigger}
        type="button"
        id="btn-customer-account"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-controls="customer-account-actions"
        aria-label="Open account options"
        title="Account options"
        className={`cust-card account-trigger tw:flex tw:items-center tw:w-full tw:gap-2.5 tw:p-1.5 tw:rounded-xl tw:bg-transparent tw:hover:bg-slate-100/80 tw:transition-all tw:cursor-pointer tw:text-left tw:border-0 ${
          open || isProfile ? 'is-open tw:bg-slate-100/80' : ''
        }`}
      >
        <span className="cust-avatar-box tw:relative tw:w-8 tw:h-8 tw:shrink-0">
          <span className="initial-avatar tw:grid tw:place-items-center tw:w-8 tw:h-8 tw:rounded-full tw:bg-gradient-to-tr tw:from-purple-600 tw:to-indigo-500 tw:text-white tw:text-xs tw:font-bold tw:shadow-2xs">
            {initial}
          </span>
          <span className="tw:absolute tw:bottom-0 tw:right-0 tw:w-2 tw:h-2 tw:rounded-full tw:bg-emerald-500 tw:border-2 tw:border-white" />
        </span>

        {!collapsed && (
          <>
            <span className="cust-card-text tw:flex tw:flex-col tw:min-w-0 tw:flex-1">
              <span className="cust-name tw:text-xs tw:font-bold tw:text-slate-900 tw:truncate tw:leading-snug">
                {actor.fullName}
              </span>
              <span className="cust-role tw:text-[11px] tw:text-slate-500 tw:truncate tw:leading-snug">
                {actor.accountCode}
              </span>
            </span>

            <svg
              className={`account-chevron tw:text-slate-400 tw:shrink-0 tw:transition-transform ${
                open ? 'tw:rotate-180' : ''
              }`}
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </>
        )}
      </button>
    </div>
  );
}

