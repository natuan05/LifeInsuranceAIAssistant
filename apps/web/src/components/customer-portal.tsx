'use client';

import type { ReactNode } from 'react';
import type { Actor } from '@/lib/auth-api';
import { CustomerWorkspace } from './customer-workspace';

export function CustomerPortal({
  actor,
  csrfToken,
  account,
  children,
  pending,
  error,
  onSignOut,
}: {
  actor: Actor;
  csrfToken: string;
  account: boolean;
  children?: ReactNode;
  pending: boolean;
  error: string;
  onSignOut: () => void;
}) {
  return (
    <CustomerWorkspace
      key={actor.id}
      actor={actor}
      csrfToken={csrfToken}
      blocked={Boolean(error) || pending}
      account={account}
      accountContent={children}
      onSignOut={onSignOut}
      pendingSignOut={pending}
    />
  );
}

