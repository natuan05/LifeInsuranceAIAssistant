'use client';
import { realtimeEvent } from '@/lib/realtime';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthError } from '@/lib/auth-api';
import { ownProfile, type Customer, type OwnProfile } from '@/lib/customer-api';

function ProfileDetails({ customer }: { customer: Customer }) {
  return <dl className="auth-details">
    <div><dt>Full name</dt><dd>{customer.fullName}</dd></div>
    <div><dt>Customer code</dt><dd>{customer.accountCode}</dd></div>
    <div><dt>Email</dt><dd>{customer.email}</dd></div>
    <div><dt>Phone</dt><dd>{customer.phone || 'Not provided'}</dd></div>
    <div><dt>Date of birth</dt><dd>{customer.birth || 'Not provided'}</dd></div>
    <div><dt>Address</dt><dd>{customer.address || 'Not provided'}</dd></div>
    <div><dt>Account status</dt><dd>{customer.status === 'ACTIVE' ? 'Active' : 'Locked'}</dd></div>
  </dl>;
}

export function CustomerWorkspace({ actorId }: { actorId: string }) {
  const router = useRouter();
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [own, setOwn] = useState<OwnProfile | null>(null);
  const loadedKey = useRef('');
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    async function load() {
      const key = actorId;
      if (loadedKey.current !== key) { setLoading(true); setOwn(null); }
      setError('');
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]);
      try {
        const result = await ownProfile(signal);
        if (active) { loadedKey.current = key; setOwn(result); }
      } catch (failure) {
        if (!active) return;
        if (failure instanceof AuthError && [401,403,404].includes(failure.status)) { loadedKey.current='';setOwn(null); }
        if (failure instanceof AuthError && failure.status === 401) router.replace('/login');
        else setError(failure instanceof AuthError && failure.status === 403 ? 'You do not have permission to view this content.' : 'Unable to load data. Please try again.');
      } finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; controller.abort(); };
  }, [actorId, revision, router]);
  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    window.addEventListener(realtimeEvent, refresh);
    return () => window.removeEventListener(realtimeEvent, refresh);
  }, []);
  return <section className="auth-card customer-workspace" aria-labelledby="workspace-title">
    <div className="workspace-heading"><h2 id="workspace-title">Your profile</h2>
      <button type="button" onClick={() => setRevision(value => value + 1)} disabled={loading}>Refresh</button></div>
    {loading && <p role="status">Loading data…</p>}
    {error && <p role="alert" className="auth-error">{error}</p>}
    {!loading && own && <><ProfileDetails customer={own.customer} /><section className="staff-contact" aria-labelledby="staff-title">
      <h3 id="staff-title">Assigned staff</h3>
      {own.staff ? <dl className="auth-details"><div><dt>Full name</dt><dd>{own.staff.fullName}</dd></div><div><dt>Contact email</dt><dd>{own.staff.email}</dd></div>
        <div><dt>Contact phone</dt><dd>{own.staff.phone || 'Not provided'}</dd></div><div><dt>Department</dt><dd>{own.staff.department || 'Not provided'}</dd></div></dl>
        : <p>{own.assignmentStatus === 'UNASSIGNED' ? 'No staff member is currently assigned.' : 'Your assigned staff member is currently unavailable. Contact your administrator for assistance.'}</p>}
    </section></>}
  </section>;
}
