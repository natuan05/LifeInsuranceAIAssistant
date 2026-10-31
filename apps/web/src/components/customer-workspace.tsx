'use client';
import { realtimeEvent } from '@/lib/realtime';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthError } from '@/lib/auth-api';
import { ownProfile, type Customer, type OwnProfile } from '@/lib/customer-api';
function ProfileDetails({ customer }: {
    customer: Customer;
}) {
    return <dl className={"auth-details tw:grid tw:[grid-template-columns:1fr_1fr] tw:gap-[24px] tw:mt-[30px] tw:[&_dt]:text-[12px] tw:[&_dt]:text-[#708176] tw:[&_dd]:mt-[7px] tw:[&_dd]:mr-[0] tw:[&_dd]:mb-[0] tw:[&_dd]:ml-[0] tw:[&_dd]:text-[15px] tw:[&_dd]:wrap-anywhere tw:max-[700px]:[grid-template-columns:1fr]"}>
    <div><dt>Full name</dt><dd>{customer.fullName}</dd></div>
    <div><dt>Customer code</dt><dd>{customer.accountCode}</dd></div>
    <div><dt>Email</dt><dd>{customer.email}</dd></div>
    <div><dt>Phone</dt><dd>{customer.phone || 'Not provided'}</dd></div>
    <div><dt>Date of birth</dt><dd>{customer.birth || 'Not provided'}</dd></div>
    <div><dt>Address</dt><dd>{customer.address || 'Not provided'}</dd></div>
    <div><dt>Account status</dt><dd>{customer.status === 'ACTIVE' ? 'Active' : 'Locked'}</dd></div>
  </dl>;
}
export function CustomerWorkspace({ actorId }: {
    actorId: string;
}) {
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
            if (loadedKey.current !== key) {
                setLoading(true);
                setOwn(null);
            }
            setError('');
            const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]);
            try {
                const result = await ownProfile(signal);
                if (active) {
                    loadedKey.current = key;
                    setOwn(result);
                }
            }
            catch (failure) {
                if (!active)
                    return;
                if (failure instanceof AuthError && [401, 403, 404].includes(failure.status)) {
                    loadedKey.current = '';
                    setOwn(null);
                }
                if (failure instanceof AuthError && failure.status === 401)
                    router.replace('/login');
                else
                    setError(failure instanceof AuthError && failure.status === 403 ? 'You do not have permission to view this content.' : 'Unable to load data. Please try again.');
            }
            finally {
                if (active)
                    setLoading(false);
            }
        }
        void load();
        return () => { active = false; controller.abort(); };
    }, [actorId, revision, router]);
    useEffect(() => {
        const refresh = () => setRevision(value => value + 1);
        window.addEventListener(realtimeEvent, refresh);
        return () => window.removeEventListener(realtimeEvent, refresh);
    }, []);
    return <section className={"auth-card tw:bg-white tw:[border:1px_solid_#dce6e1] tw:rounded-[18px] tw:pt-[32px] tw:pr-[32px] tw:pb-[32px] tw:pl-[32px] tw:[box-shadow:0_12px_40px_#163e2f08] tw:[&_h1]:text-[30px] tw:[&_h1]:leading-[1.3] tw:[&_h1]:mt-[14px] tw:[&_h1]:mr-[0] tw:[&_h1]:mb-[14px] tw:[&_h1]:ml-[0] tw:[&_h2]:text-[27px] tw:[&_h2]:mt-[0] tw:[&_h2]:mr-[0] tw:[&_h2]:mb-[10px] tw:[&_h2]:ml-[0] tw:[&>p]:text-[#687c72] tw:[&>p]:text-[14px] tw:max-[700px]:pt-[24px] tw:max-[700px]:pr-[24px] tw:max-[700px]:pb-[24px] tw:max-[700px]:pl-[24px] customer-workspace tw:mt-[24px]"} aria-labelledby="workspace-title">
    <div className={"workspace-heading tw:flex tw:items-center tw:justify-between tw:gap-[16px] tw:flex-wrap tw:[&_h2]:m-0 tw:[&_h3]:m-0 tw:[.auth-shell_&_button]:w-[auto] tw:[.auth-shell_&_button]:pt-[10px] tw:[.auth-shell_&_button]:pr-[16px] tw:[.auth-shell_&_button]:pb-[10px] tw:[.auth-shell_&_button]:pl-[16px] tw:[.auth-shell_&_button]:justify-center tw:max-[600px]:[&_h2]:text-[22px]"}><h2 id="workspace-title">Your profile</h2>
      <button type="button" onClick={() => setRevision(value => value + 1)} disabled={loading}>Refresh</button></div>
    {loading && <p role="status">Loading data…</p>}
    {error && <p role="alert" className={"auth-error tw:text-[#a02f2f]! tw:bg-[#fff0ee] tw:rounded-[8px] tw:pt-[12px] tw:pr-[12px] tw:pb-[12px] tw:pl-[12px] tw:text-[13px] tw:leading-[1.6]"}>{error}</p>}
    {!loading && own && <><ProfileDetails customer={own.customer}/><section className={"staff-contact tw:[border-top:1px_solid_var(--tw-color-portal-line)] tw:mt-[28px] tw:pt-[20px]"} aria-labelledby="staff-title">
      <h3 id="staff-title">Assigned staff</h3>
      {own.staff ? <dl className={"auth-details tw:grid tw:[grid-template-columns:1fr_1fr] tw:gap-[24px] tw:mt-[30px] tw:[&_dt]:text-[12px] tw:[&_dt]:text-[#708176] tw:[&_dd]:mt-[7px] tw:[&_dd]:mr-[0] tw:[&_dd]:mb-[0] tw:[&_dd]:ml-[0] tw:[&_dd]:text-[15px] tw:[&_dd]:wrap-anywhere tw:max-[700px]:[grid-template-columns:1fr]"}><div><dt>Full name</dt><dd>{own.staff.fullName}</dd></div><div><dt>Contact email</dt><dd>{own.staff.email}</dd></div>
        <div><dt>Contact phone</dt><dd>{own.staff.phone || 'Not provided'}</dd></div><div><dt>Department</dt><dd>{own.staff.department || 'Not provided'}</dd></div></dl>
                : <p>{own.assignmentStatus === 'UNASSIGNED' ? 'No staff member is currently assigned.' : 'Your assigned staff member is currently unavailable. Contact your administrator for assistance.'}</p>}
    </section></>}
  </section>;
}
