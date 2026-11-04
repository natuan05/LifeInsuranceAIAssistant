'use client';
import { useState, type FormEvent } from 'react';
import { AuthError, changePassword, type Session } from '@/lib/auth-api';
import { PasswordInput } from './password-input';
export function ChangePasswordForm({ session, onChanged, onExpired, appearance }: {
    appearance?: 'staff';
    session: Session;
    onChanged: (session: Session) => void;
    onExpired: () => void;
}) {
    const [pending, setPending] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (pending)
            return;
        const form = event.currentTarget;
        const data = new FormData(form);
        const current = String(data.get('currentPassword') ?? '');
        const next = String(data.get('newPassword') ?? '');
        const confirm = String(data.get('confirmPassword') ?? '');
        setError('');
        setSuccess(false);
        if (Array.from(next).length < 6 || new TextEncoder().encode(next).length > 72) {
            setError('Use at least 6 characters and no more than 72 UTF-8 bytes. Accented characters and emoji may use multiple bytes.');
            return;
        }
        if (next !== confirm) {
            setError('The new passwords do not match.');
            return;
        }
        if (current === next) {
            setError('Your new password must differ from your current password.');
            return;
        }
        setPending(true);
        try {
            const updated = await changePassword(current, next, confirm, session.csrfToken);
            form.reset();
            onChanged(updated);
            setSuccess(true);
        }
        catch (failure) {
            if (failure instanceof AuthError && failure.status === 401) {
                onExpired();
                return;
            }
            setError(failure instanceof AuthError && failure.status === 400
                ? 'Unable to change your password. Check your current password and confirm a different new password.'
                : failure instanceof AuthError ? failure.message : 'Unable to connect. Please try again.');
        }
        finally {
            setPending(false);
        }
    }
    return <section className={appearance === "staff" ? "tw:[&_h2]:text-[13px] tw:[&_h2]:leading-[20px] tw:[&_h2]:[margin:0_0_8px] tw:[&_#password-help]:text-[11px] tw:[&_#password-help]:leading-[19px] tw:[&_#password-help]:text-[#64748b] tw:[&_#password-help]:mb-[20px] tw:[&_.success]:text-[11px] tw:[&_.success]:leading-[19px] tw:[&_.success]:text-[#047857] tw:[&_.success]:[padding:10px] tw:[&_.success]:bg-[#ecfdf5] tw:[&_.success]:rounded-[6px]" : "auth-card tw:bg-white tw:[border:1px_solid_#dce6e1] tw:rounded-[18px] tw:pt-[32px] tw:pr-[32px] tw:pb-[32px] tw:pl-[32px] tw:[box-shadow:0_12px_40px_#163e2f08] tw:[&_h1]:text-[30px] tw:[&_h1]:leading-[1.3] tw:[&_h1]:mt-[14px] tw:[&_h1]:mr-[0] tw:[&_h1]:mb-[14px] tw:[&_h1]:ml-[0] tw:[&_h2]:text-[27px] tw:[&_h2]:mt-[0] tw:[&_h2]:mr-[0] tw:[&_h2]:mb-[10px] tw:[&_h2]:ml-[0] tw:[&>p]:text-[#687c72] tw:[&>p]:text-[14px] tw:max-[700px]:pt-[24px] tw:max-[700px]:pr-[24px] tw:max-[700px]:pb-[24px] tw:max-[700px]:pl-[24px] password-card tw:mt-[24px]"} id="change-password" aria-labelledby="password-title">
    <h2 id="password-title">Change password</h2>
    <p id="password-help">Use at least 6 characters and no more than 72 UTF-8 bytes. Other devices will be signed out; you will stay signed in on this device.</p>
    <form className={appearance === "staff" ? "tw:grid tw:gap-2 tw:[&_label]:text-[11.5px] tw:[&_label]:font-medium tw:[&_label]:mt-[7px] tw:[&_input]:font-[inherit]" : "auth-form tw:[.password-card_&]:max-w-[520px] tw:grid tw:gap-[12px] tw:mt-[28px] tw:[&_label]:text-[13px] tw:[&_label]:font-[650] tw:[&_input]:w-full tw:[&_input]:[border:1px_solid_#bacdc0] tw:[&_input]:rounded-[9px] tw:[&_input]:pt-[13px] tw:[&_input]:pr-[13px] tw:[&_input]:pb-[13px] tw:[&_input]:pl-[13px] tw:[&_input]:font-[inherit] tw:[&_input]:bg-[#fcfdfc] tw:[&_input]:text-[#18352e] tw:[&_input]:mb-[8px] tw:[&_input:focus]:[outline:2px_solid_#43866b] tw:[&_input:focus]:[outline-offset:2px]"} onSubmit={submit} aria-describedby="password-help">
      <label htmlFor="current-password">Current password</label>
      <PasswordInput appearance={appearance === 'staff' ? 'login' : undefined} id="current-password" label="Current password" name="currentPassword" autoComplete="current-password" required maxLength={128} disabled={pending}/>
      <label htmlFor="new-password">New password</label>
      <PasswordInput appearance={appearance === 'staff' ? 'login' : undefined} id="new-password" label="New password" name="newPassword" autoComplete="new-password" required maxLength={72} disabled={pending}/>
      <label htmlFor="confirm-password">Confirm new password</label>
      <PasswordInput appearance={appearance === 'staff' ? 'login' : undefined} id="confirm-password" label="Confirm new password" name="confirmPassword" autoComplete="new-password" required maxLength={72} disabled={pending}/>
      {error && <p className={appearance === "staff" ? "tw:[padding:10px] tw:rounded-[6px] tw:bg-[#fef2f2] tw:text-[#b42318] tw:text-[11px] tw:leading-[19px]" : "auth-error tw:text-[#a02f2f]! tw:bg-[#fff0ee] tw:rounded-[8px] tw:pt-[12px] tw:pr-[12px] tw:pb-[12px] tw:pl-[12px] tw:text-[13px] tw:leading-[1.6]"} role="alert">{error}</p>}
      {success && <p className={appearance === "staff" ? "tw:rounded-md tw:bg-emerald-50 tw:p-2.5 tw:text-[11px] tw:leading-[19px] tw:text-emerald-700" : "success tw:text-[#216949] tw:font-bold"} role="status">Password updated. Previous sessions have been signed out.</p>}
      <button className={appearance === "staff" ? "tw:w-full tw:justify-center tw:[padding:11px_14px] tw:rounded-[7px] tw:bg-[#2563eb] tw:text-white tw:text-[12px] tw:font-medium tw:mt-[10px] tw:[&:hover]:bg-[#1d4ed8] tw:[&:disabled]:opacity-60 tw:[&:disabled]:cursor-wait" : "auth-primary tw:[.auth-form_&]:bg-[#1c5942] tw:[.auth-form_&]:text-white tw:[.auth-form_&]:rounded-[9px] tw:[.auth-form_&]:w-full tw:[.auth-form_&]:justify-center tw:[.auth-form_&]:mt-[4px] tw:[.auth-form_&]:mr-[0] tw:[.auth-form_&]:mb-[0] tw:[.auth-form_&]:ml-[0]"} disabled={pending}>{pending ? 'Updating password…' : 'Save new password'}</button>
    </form>
  </section>;
}
