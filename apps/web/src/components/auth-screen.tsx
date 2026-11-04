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
        if (next && /^\/staff\/(customers|inbox|policies|tickets)(?:[/?]|$)/.test(next) && !/[\\\r\n]/.test(next))
            return next;
    }
    return home(actor);
}
type Mode = 'login' | 'staff-login' | 'STAFF' | 'CUSTOMER' | 'account';
export function AuthScreen({ mode }: {
    mode: Mode;
}) {
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
            if (refreshing)
                return;
            refreshing = true;
            try {
                const current = await me();
                if (!active)
                    return;
                if (isLogin || (mode !== 'account' && mode !== current.actor.role)) {
                    setSession(null);
                    router.replace(isLogin ? loginDestination(current.actor) : home(current.actor));
                }
                else {
                    setSession(current);
                    setError('');
                }
            }
            catch (failure) {
                if (!active)
                    return;
                if (failure instanceof AuthError && failure.status === 401) {
                    setSession(null);
                    if (!isLogin)
                        router.replace(mode === 'STAFF' ? `${loginPath}?next=${encodeURIComponent(window.location.pathname + window.location.search)}` : loginPath);
                }
                else {
                    setSession(null);
                    setError('Unable to connect. Please try again.');
                }
            }
            finally {
                refreshing = false;
                if (active)
                    setLoading(false);
            }
        }
        void refresh();
        const focus = () => { void refresh(); };
        const changed = () => {
            if (document.visibilityState === 'visible')
                void refresh();
        };
        window.addEventListener(realtimeEvent, focus);
        window.addEventListener('focus', focus);
        document.addEventListener('visibilitychange', changed);
        return () => { window.removeEventListener(realtimeEvent, focus); active = false; window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', changed); };
    }, [mode, router, isLogin, loginPath]);
    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (pending)
            return;
        const form = event.currentTarget;
        const data = new FormData(form);
        setPending(true);
        setError('');
        try {
            const current = await login(String(data.get('email') ?? ''), String(data.get('password') ?? ''), mode === 'staff-login' ? 'STAFF' : 'CUSTOMER');
            form.reset();
            router.replace(loginDestination(current.actor));
        }
        catch (failure) {
            setError(failure instanceof AuthError ? failure.message : 'Unable to connect. Please try again.');
        }
        finally {
            setPending(false);
        }
    }
    async function signOut() {
        setPending(true);
        setError('');
        const destination = session?.actor.role === 'STAFF' ? '/staff/login' : '/login';
        try {
            await logout();
            setSession(null);
            router.replace(destination);
        }
        catch (failure) {
            if (failure instanceof AuthError && failure.status === 401) {
                setSession(null);
                router.replace(destination);
            }
            else
                setError('Unable to sign out. Please try again.');
        }
        finally {
            setPending(false);
        }
    }
    const actor = session?.actor;
    if (isLogin)
        return <LoginPanel key={mode} staff={mode === 'staff-login'} loading={loading} pending={pending} error={error} onSubmit={submit}/>;
    if (!loading && actor?.role === 'STAFF' && (mode === 'STAFF' || mode === 'account'))
        return <StaffPortal actor={actor} account={mode === 'account'} pending={pending} error={error} onSignOut={signOut}>
    {mode === 'account' && session && <ChangePasswordForm appearance="staff" session={session} onChanged={setSession} onExpired={() => { setSession(null); router.replace('/staff/login'); }}/>}
  </StaffPortal>;
    if (loading || !actor)
        return <main className={"session-screen tw:min-h-[100dvh] tw:grid tw:place-content-center tw:gap-[24px] tw:bg-[#f8fafc] tw:text-[#0f172a] tw:font-login tw:text-center tw:pt-[24px] tw:pr-[24px] tw:pb-[24px] tw:pl-[24px] tw:[:where(&)_h1]:mt-[16px] tw:[:where(&)_h1]:mr-[0] tw:[:where(&)_h1]:mb-[16px] tw:[:where(&)_h1]:ml-[0] tw:[:where(&)_h1]:text-[clamp(30px,_6vw,_42px)] tw:[:where(&)_h1]:tracking-[-1.5px] tw:[:where(&)_button]:flex tw:[:where(&)_button]:items-center tw:[:where(&)_button]:justify-between tw:[:where(&)_button]:gap-[16px] tw:[:where(&)_button]:w-full tw:[:where(&)_button]:pt-[16px] tw:[:where(&)_button]:pr-[18px] tw:[:where(&)_button]:pb-[16px] tw:[:where(&)_button]:pl-[18px] tw:[:where(&)_button]:border-0 tw:[:where(&)_button]:rounded-[8px] tw:[:where(&)_button]:bg-[#1b5a48] tw:[:where(&)_button]:text-white tw:[:where(&)_button]:text-[14px] tw:[:where(&)_button]:font-semibold tw:[:where(&)_button]:cursor-pointer tw:[:where(&)_button:hover]:bg-[#154b3b] tw:[:where(&)_button:focus-visible]:[outline:3px_solid_#8dc8ac] tw:[:where(&)_button:focus-visible]:[outline-offset:3px] tw:[:where(&)_button:disabled]:opacity-[.65] tw:[:where(&)_button:disabled]:cursor-wait tw:[:where(&)_pre]:mt-[14px] tw:[:where(&)_pre]:mr-[0] tw:[:where(&)_pre]:mb-[14px] tw:[:where(&)_pre]:ml-[0] tw:[:where(&)_pre]:pt-[16px] tw:[:where(&)_pre]:pr-[16px] tw:[:where(&)_pre]:pb-[16px] tw:[:where(&)_pre]:pl-[16px] tw:[:where(&)_pre]:bg-[#f4f7f4] tw:[:where(&)_pre]:[border:1px_solid_var(--tw-color-portal-line)] tw:[:where(&)_pre]:rounded-[8px] tw:[:where(&)_pre]:overflow-x-auto tw:[:where(&)_pre]:text-portal-ink tw:[:where(&)_pre]:text-[12px] tw:[:where(&)_footer]:pt-[24px] tw:[:where(&)_footer]:pr-[24px] tw:[:where(&)_footer]:pb-[24px] tw:[:where(&)_footer]:pl-[24px] tw:[:where(&)_footer]:text-center tw:[:where(&)_footer]:text-[#82938a] tw:[:where(&)_footer]:text-[11px]"} aria-busy={loading}>
    <div className={"session-brand tw:text-[22px] tw:font-semibold tw:tracking-[-.02em]"}>AegisLife</div>
    {error ? <div role="alert"><p>{error}</p><button onClick={() => window.location.reload()}>Try again</button></div> : <div className={"session-loader tw:flex tw:justify-center tw:gap-[7px] tw:[&_span]:w-[7px] tw:[&_span]:h-[7px] tw:[&_span]:rounded-[50%] tw:[&_span]:bg-[#2563eb] tw:[&_span]:animate-session-pulse tw:[&_span:nth-child(2)]:[animation-delay:.2s] tw:[&_span:nth-child(3)]:[animation-delay:.4s] tw:motion-reduce:[&_span]:[animation:none]"} role="status" aria-label="Loading workspace"><span /><span /><span /></div>}
  </main>;
    return <main className={"auth-shell tw:max-w-[1120px] tw:mt-[auto] tw:mr-[auto] tw:mb-[auto] tw:ml-[auto] tw:min-h-[100vh] tw:pt-[30px] tw:pr-[28px] tw:pb-[30px] tw:pl-[28px] tw:text-[#18352e] tw:[&_button]:text-[14px] tw:[&_button]:tracking-[normal] tw:max-[700px]:pt-[20px] tw:max-[700px]:pr-[20px] tw:max-[700px]:pb-[20px] tw:max-[700px]:pl-[20px] tw:[:where(&)_h1]:mt-[16px] tw:[:where(&)_h1]:mr-[0] tw:[:where(&)_h1]:mb-[16px] tw:[:where(&)_h1]:ml-[0] tw:[:where(&)_h1]:text-[clamp(30px,_6vw,_42px)] tw:[:where(&)_h1]:tracking-[-1.5px] tw:[:where(&)_button]:flex tw:[:where(&)_button]:items-center tw:[:where(&)_button]:justify-between tw:[:where(&)_button]:gap-[16px] tw:[:where(&)_button]:w-full tw:[:where(&)_button]:pt-[16px] tw:[:where(&)_button]:pr-[18px] tw:[:where(&)_button]:pb-[16px] tw:[:where(&)_button]:pl-[18px] tw:[:where(&)_button]:border-0 tw:[:where(&)_button]:rounded-[8px] tw:[:where(&)_button]:bg-[#1b5a48] tw:[:where(&)_button]:text-white tw:[:where(&)_button]:text-[14px] tw:[:where(&)_button]:font-semibold tw:[:where(&)_button]:cursor-pointer tw:[:where(&)_button:hover]:bg-[#154b3b] tw:[:where(&)_button:focus-visible]:[outline:3px_solid_#8dc8ac] tw:[:where(&)_button:focus-visible]:[outline-offset:3px] tw:[:where(&)_button:disabled]:opacity-[.65] tw:[:where(&)_button:disabled]:cursor-wait tw:[:where(&)_pre]:mt-[14px] tw:[:where(&)_pre]:mr-[0] tw:[:where(&)_pre]:mb-[14px] tw:[:where(&)_pre]:ml-[0] tw:[:where(&)_pre]:pt-[16px] tw:[:where(&)_pre]:pr-[16px] tw:[:where(&)_pre]:pb-[16px] tw:[:where(&)_pre]:pl-[16px] tw:[:where(&)_pre]:bg-[#f4f7f4] tw:[:where(&)_pre]:[border:1px_solid_var(--tw-color-portal-line)] tw:[:where(&)_pre]:rounded-[8px] tw:[:where(&)_pre]:overflow-x-auto tw:[:where(&)_pre]:text-portal-ink tw:[:where(&)_pre]:text-[12px] tw:[:where(&)_footer]:pt-[24px] tw:[:where(&)_footer]:pr-[24px] tw:[:where(&)_footer]:pb-[24px] tw:[:where(&)_footer]:pl-[24px] tw:[:where(&)_footer]:text-center tw:[:where(&)_footer]:text-[#82938a] tw:[:where(&)_footer]:text-[11px]"}>
    <header className={"auth-header tw:flex tw:items-center tw:justify-between tw:[border-bottom:1px_solid_#dce6e1] tw:pb-[24px] tw:gap-[16px] tw:[&>span]:text-[13px] tw:[&>span]:text-[#64776f] tw:max-[700px]:[&>span]:hidden"}><Link href="/" className={"auth-brand tw:text-[23px] tw:font-extrabold tw:no-underline tw:tracking-[2px] tw:text-[#174b3b] tw:[&_span]:font-normal"}>LIFE<span>CARE</span></Link><span>Care today. Peace of mind tomorrow.</span></header>
    <div className={"auth-workspace tw:max-w-[900px] tw:mt-[32px] tw:mr-[auto] tw:mb-[32px] tw:ml-[auto]"}>
        <nav className={"auth-nav tw:flex tw:items-center tw:gap-[24px] tw:mb-[26px] tw:[&_a]:text-[#275f47] tw:[&_a]:text-[14px] tw:[&_button]:mt-[0] tw:[&_button]:mr-[0] tw:[&_button]:mb-[0] tw:[&_button]:ml-[auto] tw:[&_button]:w-[auto] tw:[&_button]:pt-[10px] tw:[&_button]:pr-[16px] tw:[&_button]:pb-[10px] tw:[&_button]:pl-[16px] tw:[&_button]:bg-[#e5ede7] tw:[&_button]:text-[#254b37] tw:[&_button]:rounded-[8px]"} aria-label="Account navigation"><Link href={home(actor)}>Home</Link><Link href="/account">Account</Link><button onClick={signOut} disabled={pending}>{pending ? 'Working…' : 'Sign out'}</button></nav>
        {error && <p className={"auth-error tw:text-[#a02f2f]! tw:bg-[#fff0ee] tw:rounded-[8px] tw:pt-[12px] tw:pr-[12px] tw:pb-[12px] tw:pl-[12px] tw:text-[13px] tw:leading-[1.6]"} role="alert">{error}</p>}
        {actor.passwordChangeRecommended && !dismissed && <aside className={"auth-banner tw:[&_a]:text-inherit tw:[&_a]:font-bold tw:flex tw:items-center tw:gap-[16px] tw:bg-[#fff6db] tw:text-[#796026] tw:[border:1px_solid_#eaddad] tw:rounded-[10px] tw:pt-[16px] tw:pr-[16px] tw:pb-[16px] tw:pl-[16px] tw:mb-[20px] tw:text-[13px] tw:leading-[1.6] tw:[&_button]:w-[auto] tw:[&_button]:m-0 tw:[&_button]:whitespace-nowrap tw:[&_button]:pt-[8px] tw:[&_button]:pr-[12px] tw:[&_button]:pb-[8px] tw:[&_button]:pl-[12px] tw:[&_button]:bg-transparent tw:[&_button]:text-[#795f26] tw:[&_button]:[border:1px_solid_#c6b779] tw:[&_button]:rounded-[6px] tw:max-[700px]:items-start"}><span>You are using an issued password. We recommend changing it when convenient. <Link href="/account#change-password">Change password</Link></span><button onClick={() => setDismissed(true)}>Later</button></aside>}
        <section className={"auth-card tw:bg-white tw:[border:1px_solid_#dce6e1] tw:rounded-[18px] tw:pt-[32px] tw:pr-[32px] tw:pb-[32px] tw:pl-[32px] tw:[box-shadow:0_12px_40px_#163e2f08] tw:[&_h1]:text-[30px] tw:[&_h1]:leading-[1.3] tw:[&_h1]:mt-[14px] tw:[&_h1]:mr-[0] tw:[&_h1]:mb-[14px] tw:[&_h1]:ml-[0] tw:[&_h2]:text-[27px] tw:[&_h2]:mt-[0] tw:[&_h2]:mr-[0] tw:[&_h2]:mb-[10px] tw:[&_h2]:ml-[0] tw:[&>p]:text-[#687c72] tw:[&>p]:text-[14px] tw:max-[700px]:pt-[24px] tw:max-[700px]:pr-[24px] tw:max-[700px]:pb-[24px] tw:max-[700px]:pl-[24px]"}><p className={"auth-eyebrow tw:text-[11px] tw:tracking-[2px] tw:font-bold tw:text-[#39725b]"}>CUSTOMER PORTAL</p><h1>{mode === 'account' ? 'Your account' : `Hello, ${actor.fullName}`}</h1><p>You are signed in.</p>
          <dl className={"auth-details tw:grid tw:[grid-template-columns:1fr_1fr] tw:gap-[24px] tw:mt-[30px] tw:[&_dt]:text-[12px] tw:[&_dt]:text-[#708176] tw:[&_dd]:mt-[7px] tw:[&_dd]:mr-[0] tw:[&_dd]:mb-[0] tw:[&_dd]:ml-[0] tw:[&_dd]:text-[15px] tw:[&_dd]:wrap-anywhere tw:max-[700px]:[grid-template-columns:1fr]"}><div><dt>Full name</dt><dd>{actor.fullName}</dd></div><div><dt>Account code</dt><dd>{actor.accountCode}</dd></div><div><dt>Email</dt><dd>{actor.email}</dd></div><div><dt>Role</dt><dd>Customer</dd></div></dl>
        </section>
        {mode === 'CUSTOMER' && <CustomerWorkspace key={actor.id} actorId={actor.id}/>}
        {mode === 'account' && session && <ChangePasswordForm session={session} onChanged={setSession} onExpired={() => {
                setSession(null);
                router.replace('/login');
            }}/>}
      </div>
    <footer className={"auth-footer tw:flex tw:justify-between tw:text-[12px] tw:text-[#75877d] tw:pt-[26px] tw:pr-[0] tw:pb-[26px] tw:pl-[0] tw:gap-[16px] tw:[&_a]:text-inherit tw:max-[700px]:flex-wrap"}>LifeCare · Customer Portal <Link href="/connection">Connection status</Link></footer>
  </main>;
}
