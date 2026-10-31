import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
    title: 'LifeCare · Insurance Services',
    description: 'A portal for life insurance customers and support staff.',
};
export default function RootLayout({ children }: Readonly<{
    children: React.ReactNode;
}>) {
    return (<html lang="en" className={"tw:[color-scheme:light] "}>
      <body className={"tw:[:where(&)_*]:box-border tw:m-0 tw:bg-[#f3f6f3] tw:text-portal-ink tw:font-[Arial,Helvetica,sans-serif] "}>{children}</body>
    </html>);
}
