import { Suspense } from 'react';
import { AuthScreen } from '@/components/auth-screen';
export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<main className="session-screen" aria-busy="true"><div className="session-brand">AegisLife</div></main>}><AuthScreen mode="STAFF" />{children}</Suspense>;
}
