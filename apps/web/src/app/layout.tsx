import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'LifeCare · Insurance Services',
  description: 'A portal for life insurance customers and support staff.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
