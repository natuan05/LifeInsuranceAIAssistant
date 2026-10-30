import { Suspense } from 'react';
import { AuthScreen } from '@/components/auth-screen';
export default function AccountPage() { return <Suspense fallback={<main className="session-screen" aria-busy="true"><div className="session-brand">AegisLife</div></main>}><AuthScreen mode="account" /></Suspense>; }
