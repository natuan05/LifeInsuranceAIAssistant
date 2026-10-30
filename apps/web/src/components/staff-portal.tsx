 'use client';
import type { ReactNode } from 'react';
import type { Actor } from '@/lib/auth-api';
import { StaffReferenceWorkspace } from './staff-reference-workspace';
import { StaffPersonalInformation } from './staff-personal-information';

export function StaffPortal({actor,account,children,pending,error,onSignOut}:{actor:Actor;account:boolean;children?:ReactNode;pending:boolean;error:string;onSignOut:()=>void}) {
  return <StaffReferenceWorkspace actor={actor} pending={pending} error={error} onSignOut={onSignOut} account={account} accountContent={account?<StaffPersonalInformation actor={actor}>{children}</StaffPersonalInformation>:undefined}/>;
}
