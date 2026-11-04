'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AuthError, me } from '@/lib/auth-api';
import { realtimeEvent } from '@/lib/realtime';
import { staffProfile, updateStaffProfile, type StaffProfile } from '@/lib/staff-profile-api';
export function StaffProfileEditor({ actorId }: {
    actorId: string;
}) {
    const router = useRouter();
    const [profile, setProfile] = useState<StaffProfile | null>(null);
    const [editing, setEditing] = useState(false);
    const [pending, setPending] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [fullName, setFullName] = useState('');
    const [phone, setPhone] = useState('');
    const [reload, setReload] = useState(0);
    const [conflict, setConflict] = useState(false);
    const editButton = useRef<HTMLButtonElement>(null);
    const nameInput = useRef<HTMLInputElement>(null);
    useEffect(() => {
        const controller = new AbortController();
        staffProfile(AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]))
            .then(({ staff }) => { setProfile(staff); setFullName(staff.fullName); setPhone(staff.phone ?? ''); })
            .catch(failure => {
            if (controller.signal.aborted)
                return;
            if (failure instanceof AuthError && (failure.status === 401 || failure.status === 403)) {
                setProfile(null);
                router.replace('/staff/login');
                return;
            }
            setError('Unable to load your profile. Please try again.');
        }).finally(() => { if (!controller.signal.aborted)
            setLoading(false); });
        return () => controller.abort();
    }, [actorId, reload, router]);
    useEffect(() => { if (editing)
        nameInput.current?.focus(); }, [editing]);
    function retry() {
        setLoading(true);
        setError('');
        setSuccess('');
        setConflict(false);
        setEditing(false);
        setReload(value => value + 1);
    }
    async function save(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (pending || !profile || conflict)
            return;
        const name = fullName.trim(), number = phone.trim();
        setError('');
        setSuccess('');
        if (!name || Array.from(name).length > 255 || /\p{Cc}/u.test(name)) {
            setError('Enter a full name of 1–255 characters without control characters.');
            return;
        }
        if (number && !/^\+?[0-9]{7,15}$/.test(number)) {
            setError('Use 7–15 digits for your phone number, with an optional leading +.');
            return;
        }
        setPending(true);
        try {
            const session = await me();
            if (session.actor.id !== actorId || session.actor.role !== 'STAFF') {
                setProfile(null);
                router.replace('/staff/login');
                return;
            }
            const { staff } = await updateStaffProfile({ fullName: name, phone: number || null, expectedUpdatedAt: profile.updatedAt }, session.csrfToken);
            setProfile(staff);
            setFullName(staff.fullName);
            setPhone(staff.phone ?? '');
            setEditing(false);
            setSuccess('Your profile has been updated.');
            window.dispatchEvent(new Event(realtimeEvent));
            requestAnimationFrame(() => editButton.current?.focus());
        }
        catch (failure) {
            if (failure instanceof AuthError && failure.status === 401) {
                setProfile(null);
                router.replace('/staff/login');
                return;
            }
            if (failure instanceof AuthError && failure.status === 409) {
                setConflict(true);
                setError('Your profile changed elsewhere, or this phone number is already in use. Reload your profile before trying again. Your changes have not been saved.');
            }
            else
                setError(failure instanceof AuthError && failure.status === 400 ? 'Check your name and phone number, then try again.'
                    : failure instanceof AuthError ? failure.message : 'Unable to confirm the update. Reload your profile before trying again.');
        }
        finally {
            setPending(false);
        }
    }
    if (loading)
        return <div className={"tw:[padding:0_24px_24px] tw:grid tw:gap-[14px] tw:[&:is(input,button):focus-visible]:[outline:2px_solid_#2563eb] tw:[&:is(input,button):focus-visible]:[outline-offset:3px]"} role="status">Loading your profile…</div>;
    if (!profile)
        return <div className={"tw:[padding:0_24px_24px] tw:grid tw:gap-[14px] tw:[&:is(input,button):focus-visible]:[outline:2px_solid_#2563eb] tw:[&:is(input,button):focus-visible]:[outline-offset:3px]"}><p role="alert" className={"tw:[padding:10px] tw:rounded-[6px] tw:bg-[#fef2f2] tw:text-[#b42318] tw:text-[11px] tw:leading-[19px]"}>{error || 'Your profile is unavailable.'}</p><button className={"tw:flex tw:w-full tw:items-center tw:justify-between tw:gap-[12px] tw:[padding:10px_12px] tw:bg-white tw:[border:1px_solid_#dbe3ef] tw:rounded-[7px] tw:text-[#334155] tw:font-[inherit] tw:text-[12px] tw:[&:hover]:bg-[#f8fafc] tw:[&:hover]:[border-color:#bfdbfe] tw:[&:hover]:text-[#2563eb] tw:[&[hidden]]:hidden"} onClick={retry}>Try again</button></div>;
    return <div className={"tw:[padding:0_24px_24px] tw:grid tw:gap-[14px] tw:[&:is(input,button):focus-visible]:[outline:2px_solid_#2563eb] tw:[&:is(input,button):focus-visible]:[outline-offset:3px]"}>
    {editing ? <form onSubmit={save} aria-label="Edit personal information" aria-busy={pending}>
      <fieldset disabled={pending} className={"tw:grid tw:gap-[10px] tw:border-0 tw:p-0 tw:m-0 tw:min-w-0 tw:[&_legend]:text-[14px] tw:[&_legend]:font-semibold tw:[&_legend]:mb-[16px] tw:[&_label]:text-[12px] tw:[&_label]:font-medium tw:[&_label_span]:text-[12px] tw:[&_label_span]:text-[#64748b] tw:[&_label_span]:leading-[20px] tw:[&_p]:text-[12px] tw:[&_p]:text-[#64748b] tw:[&_p]:leading-[20px] tw:[&_input]:w-full tw:[&_input]:min-w-0 tw:[&_input]:[box-sizing:border-box] tw:[&_input]:[padding:11px_12px] tw:[&_input]:[border:1px_solid_#cbd5e1] tw:[&_input]:rounded-[7px] tw:[&_input]:font-[inherit] tw:[&_input]:text-[14px] tw:[&_input]:bg-white tw:[&_input]:text-[#0f172a] tw:[&_input]:[caret-color:#2563eb] tw:[&:disabled]:opacity-70"}>
        <legend>Edit personal information</legend>
        <label htmlFor="staff-full-name">Full name</label>
        <input ref={nameInput} id="staff-full-name" name="fullName" autoComplete="name" required maxLength={255} value={fullName} onChange={event => setFullName(event.target.value)}/>
        <label htmlFor="staff-phone">Phone number <span>(optional)</span></label>
        <input id="staff-phone" name="phone" type="tel" autoComplete="tel" maxLength={16} aria-describedby="staff-phone-help" value={phone} onChange={event => setPhone(event.target.value)}/>
        <p id="staff-phone-help">Use 7–15 digits, with an optional + prefix. Leave blank to remove your number.</p>
        <button className={"tw:w-full tw:justify-center tw:[padding:11px_14px] tw:rounded-[7px] tw:bg-[#2563eb] tw:text-white tw:text-[12px] tw:font-medium tw:mt-[10px] tw:[&:hover]:bg-[#1d4ed8] tw:[&:disabled]:opacity-60 tw:[&:disabled]:cursor-wait"} disabled={pending || conflict || (fullName.trim() === profile.fullName && (phone.trim() || null) === profile.phone)}>{pending ? 'Saving changes…' : 'Save changes'}</button>
        <button type="button" className={"tw:flex tw:justify-center tw:w-full tw:mt-[10px] tw:[padding:8px] tw:text-[#64748b] tw:text-[12px] tw:rounded-[6px] tw:[&:hover]:bg-[#f8fafc] tw:[&:hover]:text-[#334155]"} onClick={() => { setEditing(false); setError(''); setConflict(false); setFullName(profile.fullName); setPhone(profile.phone ?? ''); requestAnimationFrame(() => editButton.current?.focus()); }}>Cancel</button>
      </fieldset>
    </form> : <><dl className={"tw:grid tw:[grid-template-columns:1fr_1fr] tw:gap-[26px_24px] tw:[&>div]:min-w-0 tw:[&_dt]:text-[11px] tw:[&_dt]:text-[#64748b] tw:[&_dt]:mb-[7px] tw:[&_dd]:text-[12.5px] tw:[&_dd]:leading-[21px] tw:[&_dd]:[overflow-wrap:anywhere] tw:max-[600px]:[grid-template-columns:1fr] tw:max-[600px]:gap-[18px] tw:[padding:0_0_6px]"}><div><dt>Phone number</dt><dd>{profile.phone || 'Not provided'}</dd></div><div><dt>Department</dt><dd>{profile.department || 'Not provided'}</dd></div></dl><button ref={editButton} className={"tw:flex tw:w-full tw:items-center tw:justify-between tw:gap-[12px] tw:[padding:10px_12px] tw:bg-white tw:[border:1px_solid_#dbe3ef] tw:rounded-[7px] tw:text-[#334155] tw:font-[inherit] tw:text-[12px] tw:[&:hover]:bg-[#f8fafc] tw:[&:hover]:[border-color:#bfdbfe] tw:[&:hover]:text-[#2563eb] tw:[&[hidden]]:hidden"} onClick={() => { setError(''); setSuccess(''); setEditing(true); }}>Edit personal information</button></>}
    {error && <p role="alert" className={"tw:[padding:10px] tw:rounded-[6px] tw:bg-[#fef2f2] tw:text-[#b42318] tw:text-[11px] tw:leading-[19px]"}>{error}</p>}
    {conflict && <button className={"tw:flex tw:w-full tw:items-center tw:justify-between tw:gap-[12px] tw:[padding:10px_12px] tw:bg-white tw:[border:1px_solid_#dbe3ef] tw:rounded-[7px] tw:text-[#334155] tw:font-[inherit] tw:text-[12px] tw:[&:hover]:bg-[#f8fafc] tw:[&:hover]:[border-color:#bfdbfe] tw:[&:hover]:text-[#2563eb] tw:[&[hidden]]:hidden"} onClick={retry}>Reload profile and discard changes</button>}
    {success && <p role="status" className={"tw:[padding:10px] tw:text-[#047857] tw:bg-[#ecfdf5] tw:rounded-[6px] tw:text-[12px] tw:leading-[20px]"}>{success}</p>}
  </div>;
}
