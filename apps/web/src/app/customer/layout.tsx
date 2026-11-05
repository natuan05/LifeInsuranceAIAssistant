import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthScreen } from '@/components/auth-screen';

export const metadata: Metadata = {
  title: 'AegisLife · Customer Portal',
  description: 'Life insurance portfolio and policyholder services portal',
};

export default function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={null}>
      <AuthScreen mode="CUSTOMER" />
      {children}
    </Suspense>
  );
}
