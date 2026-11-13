import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AegisLife · Staff Portal',
  description: 'Specialist operations and policyholder support workspace',
};

export default function StaffRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

