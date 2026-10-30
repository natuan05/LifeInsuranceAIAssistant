'use client';

import { useState, type FormEvent } from 'react';
import { AuthError, changePassword, type Session } from '@/lib/auth-api';
import { PasswordInput } from './password-input';

export function ChangePasswordForm({ session, onChanged, onExpired, appearance }: {
  appearance?: 'staff'; session: Session; onChanged: (session: Session) => void; onExpired: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const current = String(data.get('currentPassword') ?? '');
    const next = String(data.get('newPassword') ?? '');
    const confirm = String(data.get('confirmPassword') ?? '');
    setError(''); setSuccess(false);
    if (Array.from(next).length < 6 || new TextEncoder().encode(next).length > 72) {
      setError('Use at least 6 characters and no more than 72 UTF-8 bytes. Accented characters and emoji may use multiple bytes.'); return;
    }
    if (next !== confirm) { setError('The new passwords do not match.'); return; }
    if (current === next) { setError('Your new password must differ from your current password.'); return; }
    setPending(true);
    try {
      const updated = await changePassword(current, next, confirm, session.csrfToken);
      form.reset(); onChanged(updated); setSuccess(true);
    } catch (failure) {
      if (failure instanceof AuthError && failure.status === 401) { onExpired(); return; }
      setError(failure instanceof AuthError && failure.status === 400
        ? 'Unable to change your password. Check your current password and confirm a different new password.'
        : failure instanceof AuthError ? failure.message : 'Unable to connect. Please try again.');
    } finally { setPending(false); }
  }
  return <section className={appearance === 'staff' ? 'personal-password-form' : 'auth-card password-card'} id="change-password" aria-labelledby="password-title">
    <h2 id="password-title">Change password</h2>
    <p id="password-help">Use at least 6 characters and no more than 72 UTF-8 bytes. Other devices will be signed out; you will stay signed in on this device.</p>
    <form className={appearance === 'staff' ? 'personal-password-fields' : 'auth-form'} onSubmit={submit} aria-describedby="password-help">
      <label htmlFor="current-password">Current password</label>
      <PasswordInput appearance={appearance === 'staff' ? 'login' : undefined} id="current-password" label="Current password" name="currentPassword" autoComplete="current-password" required maxLength={128} disabled={pending} />
      <label htmlFor="new-password">New password</label>
      <PasswordInput appearance={appearance === 'staff' ? 'login' : undefined} id="new-password" label="New password" name="newPassword" autoComplete="new-password" required maxLength={72} disabled={pending} />
      <label htmlFor="confirm-password">Confirm new password</label>
      <PasswordInput appearance={appearance === 'staff' ? 'login' : undefined} id="confirm-password" label="Confirm new password" name="confirmPassword" autoComplete="new-password" required maxLength={72} disabled={pending} />
      {error && <p className={appearance === 'staff' ? 'personal-form-error' : 'auth-error'} role="alert">{error}</p>}
      {success && <p className="success" role="status">Password updated. Previous sessions have been signed out.</p>}
      <button className={appearance === 'staff' ? 'personal-form-submit' : 'auth-primary'} disabled={pending}>{pending ? 'Updating password…' : 'Save new password'}</button>
    </form>
  </section>;
}
