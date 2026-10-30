'use client';

import Link from 'next/link';
import { useRealtime, realtimeEvent } from '@/lib/realtime';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { AuthError, login, logout, me, type Actor, type Session } from '@/lib/auth-api';
import { ChangePasswordForm } from './change-password-form';
import { LoginPanel } from './login-panel';
import { StaffPortal } from './staff-portal';
import { CustomerWorkspace } from './customer-workspace';

const home = (actor: Actor) => actor.role === 'STAFF' ? '/staff/customers' : '/customer';
function loginDestination(actor: Actor) {
  if (actor.role === 'STAFF') {
    const next = new URLSearchParams(window.location.search).get('next');
    if (next && /^\/staff\/(customers|inbox|policies|tickets)(?:[/?]|$)/.test(next) && !/[\\\r\n]/.test(next)) return next;
  }
  return home(actor);
}

type Mode = 'login' | 'staff-login' | 'STAFF' | 'CUSTOMER' | 'account';
export function AuthScreen({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [dismissed, setDismissed] = useState(false);
  useRealtime(!!session);
  const isLogin = mode === 'login' || mode === 'staff-login';
  const loginPath = mode === 'STAFF' || mode === 'staff-login' ? '/staff/login' : '/login';
  useEffect(() => {
    let active = true;
    let refreshing = false;
    async function refresh() {
      if (refreshing) return;
      refreshing = true;
      try {
        const current = await me();
        if (!active) return;
        if (isLogin || (mode !== 'account' && mode !== current.actor.role)) {
          setSession(null); router.replace(isLogin ? loginDestination(current.actor) : home(current.actor));
        } else { setSession(current); setError(''); }
      } catch (failure) {
        if (!active) return;
        if (failure instanceof AuthError && failure.status === 401) {
          setSession(null);
          if (!isLogin) router.replace(mode === 'STAFF' ? `${loginPath}?next=${encodeURIComponent(window.location.pathname + window.location.search)}` : loginPath);
        } else { setSession(null); setError('Unable to connect. Please try again.'); }
      } finally { refreshing = false; if (active) setLoading(false); }
    }
    void refresh();
    const focus = () => { void refresh(); };
    const changed = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener(realtimeEvent, focus);
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', changed);
    return () => { window.removeEventListener(realtimeEvent, focus); active = false; window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', changed); };
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
      router.replace(loginDestination(current.actor));
    } catch (failure) { setError(failure instanceof AuthError ? failure.message : 'Unable to connect. Please try again.'); }
    finally { setPending(false); }
  }
  async function signOut() {
    setPending(true); setError('');
    const destination = session?.actor.role === 'STAFF' ? '/staff/login' : '/login';
    try { await logout(); setSession(null); router.replace(destination); }
    catch (failure) {
      if (failure instanceof AuthError && failure.status === 401) { setSession(null); router.replace(destination); }
      else setError('Unable to sign out. Please try again.');
    } finally { setPending(false); }
  }
  const actor = session?.actor;
  if (isLogin) return <LoginPanel key={mode} staff={mode === 'staff-login'} loading={loading} pending={pending} error={error} onSubmit={submit} />;
  if (!loading && actor?.role === 'STAFF' && (mode === 'STAFF' || mode === 'account')) return <StaffPortal actor={actor} account={mode === 'account'} pending={pending} error={error} onSignOut={signOut}>
    {mode === 'account' && session && <ChangePasswordForm appearance="staff" session={session} onChanged={setSession} onExpired={() => {setSession(null);router.replace('/staff/login');}} />}
  </StaffPortal>;
  if (loading || !actor) return <main className="session-screen" aria-busy={loading}>
    <div className="session-brand">AegisLife</div>
    {error ? <div role="alert"><p>{error}</p><button onClick={() => window.location.reload()}>Try again</button></div> : <div className="session-loader" role="status" aria-label="Loading workspace"><span /><span /><span /></div>}
  </main>;
  return <main className="auth-shell">
    <header className="auth-header"><Link href="/" className="auth-brand">LIFE<span>CARE</span></Link><span>Care today. Peace of mind tomorrow.</span></header>
    <div className="auth-workspace">
        <nav className="auth-nav" aria-label="Account navigation"><Link href={home(actor)}>Home</Link><Link href="/account">Account</Link><button onClick={signOut} disabled={pending}>{pending ? 'Working…' : 'Sign out'}</button></nav>
        {error && <p className="auth-error" role="alert">{error}</p>}
        {actor.passwordChangeRecommended && !dismissed && <aside className="auth-banner"><span>You are using an issued password. We recommend changing it when convenient. <Link href="/account#change-password">Change password</Link></span><button onClick={() => setDismissed(true)}>Later</button></aside>}
        <section className="auth-card"><p className="auth-eyebrow">CUSTOMER PORTAL</p><h1>{mode === 'account' ? 'Your account' : `Hello, ${actor.fullName}`}</h1><p>You are signed in.</p>
          <dl className="auth-details"><div><dt>Full name</dt><dd>{actor.fullName}</dd></div><div><dt>Account code</dt><dd>{actor.accountCode}</dd></div><div><dt>Email</dt><dd>{actor.email}</dd></div><div><dt>Role</dt><dd>Customer</dd></div></dl>
        </section>
        {mode === 'CUSTOMER' && <CustomerWorkspace key={actor.id} actorId={actor.id} />}
        {mode === 'account' && session && <ChangePasswordForm session={session} onChanged={setSession} onExpired={() => {
          setSession(null); router.replace('/login');
        }} />}
      </div>
    <footer className="auth-footer">LifeCare · Customer Portal <Link href="/connection">Connection status</Link></footer>
  </main>;
}
