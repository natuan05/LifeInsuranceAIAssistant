import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'LifeCare · Cổng dịch vụ bảo hiểm',
  description: 'Cổng dành cho khách hàng và nhân viên chăm sóc bảo hiểm nhân thọ.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
