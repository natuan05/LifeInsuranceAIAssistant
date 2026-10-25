'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { AuthError, login, logout, me, type Actor, type Session } from '@/lib/auth-api';
import { ChangePasswordForm } from './change-password-form';
import { PasswordInput } from './password-input';
import { CustomerWorkspace } from './customer-workspace';

const home = (actor: Actor) => actor.role === 'STAFF' ? '/staff' : '/customer';
type Mode = 'login' | 'staff-login' | 'STAFF' | 'CUSTOMER' | 'account';
export function AuthScreen({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [dismissed, setDismissed] = useState(false);
  const isLogin = mode === 'login' || mode === 'staff-login';
  const loginPath = mode === 'STAFF' || mode === 'staff-login' ? '/staff/login' : '/login';
  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const current = await me();
        if (!active) return;
        if (isLogin || (mode !== 'account' && mode !== current.actor.role)) {
          setSession(null); router.replace(home(current.actor));
        } else { setSession(current); setError(''); }
      } catch (failure) {
        if (!active) return;
        if (failure instanceof AuthError && failure.status === 401) {
          setSession(null);
          if (!isLogin) router.replace(loginPath);
        } else setError('Chưa kết nối được dịch vụ. Vui lòng thử lại.');
      } finally { if (active) setLoading(false); }
    }
    void refresh();
    const focus = () => { void refresh(); };
    const changed = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', changed);
    return () => { active = false; window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', changed); };
  }, [mode, router, isLogin, loginPath]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setPending(true); setError('');
    try {
      const current = await login(String(data.get('email') ?? ''), String(data.get('password') ?? ''), mode === 'staff-login' ? 'STAFF' : 'CUSTOMER');
      form.reset();
      router.replace(home(current.actor));
    } catch (failure) { setError(failure instanceof AuthError ? failure.message : 'Chưa kết nối được dịch vụ. Vui lòng thử lại.'); }
    finally { setPending(false); }
  }
  async function signOut() {
    setPending(true); setError('');
    const destination = session?.actor.role === 'STAFF' ? '/staff/login' : '/login';
    try { await logout(); setSession(null); router.replace(destination); }
    catch (failure) {
      if (failure instanceof AuthError && failure.status === 401) { setSession(null); router.replace(destination); }
      else setError('Chưa đăng xuất được. Vui lòng thử lại.');
    } finally { setPending(false); }
  }
  const actor = session?.actor;
  return <main className="auth-shell">
    <header className="auth-header"><Link href="/" className="auth-brand">LIFE<span>CARE</span></Link><span>Chăm sóc hôm nay, an tâm ngày mai</span></header>
    {loading ? <section className="auth-card" role="status">Đang kiểm tra phiên đăng nhập…</section>
      : isLogin ? <section className="auth-login">
        <div className="auth-intro"><p className="auth-eyebrow">{mode === 'staff-login' ? 'CỔNG NHÂN VIÊN' : 'CỔNG KHÁCH HÀNG'} · BẢO HIỂM NHÂN THỌ</p><h1>Chào mừng<br />bạn trở lại.</h1><p>Đăng nhập để truy cập không gian của bạn bằng tài khoản đã được cấp.</p><div className="auth-note">{mode === 'staff-login' ? 'Dành cho nhân viên chăm sóc khách hàng.' : 'Dành cho khách hàng bảo hiểm nhân thọ.'}</div></div>
        <div className="auth-card"><h2>{mode === 'staff-login' ? 'Đăng nhập nhân viên' : 'Đăng nhập khách hàng'}</h2><p>Sử dụng email đã được cấp cho bạn.</p>
          <form onSubmit={submit} className="auth-form">
            <label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="username" required maxLength={254} placeholder={mode === 'staff-login' ? 'staff@example.com' : 'customer@example.com'} disabled={pending} />
            <label htmlFor="password">Mật khẩu</label><PasswordInput id="password" label="Mật khẩu" name="password" autoComplete="current-password" required maxLength={128} disabled={pending} />
            {error && <p className="auth-error" role="alert">{error}</p>}
            <button className="auth-primary" disabled={pending}>{pending ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>
          </form><p className="auth-help">Cần cấp hoặc khôi phục tài khoản? Hãy liên hệ người quản trị.</p>
        </div>
      </section> : actor ? <div className="auth-workspace">
        <nav className="auth-nav" aria-label="Điều hướng tài khoản"><Link href={home(actor)}>Trang chính</Link><Link href="/account">Tài khoản</Link><button onClick={signOut} disabled={pending}>{pending ? 'Đang xử lý…' : 'Đăng xuất'}</button></nav>
        {error && <p className="auth-error" role="alert">{error}</p>}
        {actor.passwordChangeRecommended && !dismissed && <aside className="auth-banner"><span>Bạn đang dùng mật khẩu được cấp. Bạn nên đổi khi thuận tiện; vẫn có thể tiếp tục sử dụng. <Link href="/account#change-password">Đổi mật khẩu</Link></span><button onClick={() => setDismissed(true)}>Để sau</button></aside>}
        <section className="auth-card"><p className="auth-eyebrow">{actor.role === 'STAFF' ? 'KHÔNG GIAN NHÂN VIÊN' : 'CỔNG KHÁCH HÀNG'}</p><h1>{mode === 'account' ? 'Tài khoản của bạn' : `Xin chào, ${actor.fullName}`}</h1><p>Bạn đã đăng nhập thành công.</p>
          <dl className="auth-details"><div><dt>Họ và tên</dt><dd>{actor.fullName}</dd></div><div><dt>Mã tài khoản</dt><dd>{actor.accountCode}</dd></div><div><dt>Email</dt><dd>{actor.email}</dd></div><div><dt>Vai trò</dt><dd>{actor.role === 'STAFF' ? 'Nhân viên' : 'Khách hàng'}</dd></div></dl>
        </section>
        {(mode === 'STAFF' || mode === 'CUSTOMER') && <CustomerWorkspace key={actor.id} actor={actor} />}
        {mode === 'account' && session && <ChangePasswordForm session={session} onChanged={setSession} onExpired={() => {
          setSession(null); router.replace(actor.role === 'STAFF' ? '/staff/login' : '/login');
        }} />}
      </div> : <section className="auth-card"><p role="alert">{error || 'Đang chuyển đến trang đăng nhập…'}</p>{error && <button onClick={() => window.location.reload()}>Thử lại</button>}</section>}
    <footer className="auth-footer">LifeCare · Cổng chăm sóc khách hàng <Link href="/connection">Trạng thái kết nối</Link></footer>
  </main>;
}
