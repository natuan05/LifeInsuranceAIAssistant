'use client';

import type { ReactNode } from 'react';
import type { Customer } from '@/lib/customer-api';
import type { Actor } from '@/lib/auth-api';

export function CustomerAccount({
  actor,
  customer,
  onSignOut,
  pendingSignOut = false,
  children,
}: {
  actor: Actor;
  customer?: Customer | null;
  onSignOut?: () => void;
  pendingSignOut?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="tw:max-w-4xl tw:space-y-6 tw:animate-in tw:fade-in-50">
      
      {/* Title */}
      <div>
        <h2 className="tw:text-xl tw:font-extrabold tw:text-slate-900 tw:tracking-tight">
          Personal Information &amp; Account Security
        </h2>
        <p className="tw:text-xs tw:text-slate-500 tw:mt-0.5">
          Your verified customer identity and sign-in credentials.
        </p>
      </div>

      {/* Identity Card */}
      <div className="tw:rounded-2xl tw:border tw:border-slate-200/80 tw:bg-white tw:p-6 tw:shadow-2xs tw:space-y-4">
        <div className="tw:border-b tw:border-slate-100 tw:pb-3">
          <span className="tw:text-[10px] tw:font-bold tw:uppercase tw:tracking-wider tw:text-slate-400">
            CUSTOMER PROFILE
          </span>
        </div>

        <div className="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-4 tw:text-xs">
          <div>
            <span className="tw:block tw:text-slate-400 tw:font-medium">Full Name</span>
            <span className="tw:font-bold tw:text-slate-900 tw:text-sm tw:mt-0.5 tw:block">
              {customer?.fullName ?? actor.fullName}
            </span>
          </div>

          <div>
            <span className="tw:block tw:text-slate-400 tw:font-medium">Customer Code</span>
            <span className="tw:font-mono tw:font-bold tw:text-slate-900 tw:text-sm tw:mt-0.5 tw:block">
              {customer?.accountCode ?? actor.accountCode}
            </span>
          </div>

          <div>
            <span className="tw:block tw:text-slate-400 tw:font-medium">Registered Email</span>
            <span className="tw:font-semibold tw:text-slate-800 tw:mt-0.5 tw:block">
              {customer?.email ?? actor.email}
            </span>
          </div>

          <div>
            <span className="tw:block tw:text-slate-400 tw:font-medium">Contact Phone</span>
            <span className="tw:font-semibold tw:text-slate-800 tw:mt-0.5 tw:block">
              {customer?.phone || 'Not provided'}
            </span>
          </div>

          <div>
            <span className="tw:block tw:text-slate-400 tw:font-medium">Date of Birth</span>
            <span className="tw:font-semibold tw:text-slate-800 tw:mt-0.5 tw:block">
              {customer?.birth || 'Not provided'}
            </span>
          </div>

          <div>
            <span className="tw:block tw:text-slate-400 tw:font-medium">Residential Address</span>
            <span className="tw:font-semibold tw:text-slate-800 tw:mt-0.5 tw:block">
              {customer?.address || 'Not provided'}
            </span>
          </div>
        </div>
      </div>

      {/* Embedded Password Change Section */}
      {children && (
        <div className="tw:rounded-2xl tw:border tw:border-slate-200/80 tw:bg-white tw:p-6 tw:shadow-2xs">
          {children}
        </div>
      )}

      {/* Account Session Actions */}
      {onSignOut && (
        <div className="tw:rounded-2xl tw:border tw:border-slate-200/80 tw:bg-white tw:p-6 tw:shadow-2xs tw:flex tw:items-center tw:justify-between tw:gap-4">
          <div>
            <h4 className="tw:text-xs tw:font-bold tw:text-slate-900">Session &amp; Security</h4>
            <p className="tw:text-[11px] tw:text-slate-500 tw:mt-0.5">
              Sign out from this device to end your active session safely.
            </p>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            disabled={pendingSignOut}
            className="tw:px-4 tw:py-2 tw:rounded-xl tw:border tw:border-red-200 tw:bg-red-50 tw:text-red-700 tw:text-xs tw:font-semibold tw:hover:bg-red-100/80 tw:transition-all tw:cursor-pointer tw:disabled:opacity-50"
          >
            {pendingSignOut ? 'Signing out...' : 'Sign out'}
          </button>
        </div>
      )}

    </div>
  );
}

