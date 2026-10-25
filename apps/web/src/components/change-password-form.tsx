'use client';

import { useState, type FormEvent } from 'react';
import { AuthError, changePassword, type Session } from '@/lib/auth-api';
import { PasswordInput } from './password-input';

export function ChangePasswordForm({ session, onChanged, onExpired }: {
  session: Session; onChanged: (session: Session) => void; onExpired: () => void;
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
      setError('Mật khẩu mới cần ít nhất 6 ký tự, tối đa 72 byte UTF-8. Chữ có dấu và emoji có thể chiếm nhiều byte.'); return;
    }
    if (next !== confirm) { setError('Xác nhận mật khẩu mới chưa khớp.'); return; }
    if (current === next) { setError('Mật khẩu mới cần khác mật khẩu hiện tại.'); return; }
    setPending(true);
    try {
      const updated = await changePassword(current, next, confirm, session.csrfToken);
      form.reset(); onChanged(updated); setSuccess(true);
    } catch (failure) {
      if (failure instanceof AuthError && failure.status === 401) { onExpired(); return; }
      setError(failure instanceof AuthError && failure.status === 400
        ? 'Chưa đổi được mật khẩu. Kiểm tra mật khẩu hiện tại, mật khẩu mới và xác nhận; mật khẩu mới phải khác mật khẩu cũ.'
        : failure instanceof AuthError ? failure.message : 'Chưa kết nối được dịch vụ. Vui lòng thử lại.');
    } finally { setPending(false); }
  }
  return <section className="auth-card password-card" id="change-password" aria-labelledby="password-title">
    <h2 id="password-title">Đổi mật khẩu</h2>
    <p id="password-help">Mật khẩu mới ít nhất 6 ký tự, tối đa 72 byte UTF-8. Sau khi đổi, các thiết bị khác cần đăng nhập lại; bạn tiếp tục sử dụng trên thiết bị này.</p>
    <form className="auth-form" onSubmit={submit} aria-describedby="password-help">
      <label htmlFor="current-password">Mật khẩu hiện tại</label>
      <PasswordInput id="current-password" label="Mật khẩu hiện tại" name="currentPassword" autoComplete="current-password" required maxLength={128} disabled={pending} />
      <label htmlFor="new-password">Mật khẩu mới</label>
      <PasswordInput id="new-password" label="Mật khẩu mới" name="newPassword" autoComplete="new-password" required maxLength={72} disabled={pending} />
      <label htmlFor="confirm-password">Xác nhận mật khẩu mới</label>
      <PasswordInput id="confirm-password" label="Xác nhận mật khẩu mới" name="confirmPassword" autoComplete="new-password" required maxLength={72} disabled={pending} />
      {error && <p className="auth-error" role="alert">{error}</p>}
      {success && <p className="success" role="status">Đã đổi mật khẩu. Các phiên cũ đã được đăng xuất.</p>}
      <button className="auth-primary" disabled={pending}>{pending ? 'Đang đổi mật khẩu…' : 'Lưu mật khẩu mới'}</button>
    </form>
  </section>;
}
