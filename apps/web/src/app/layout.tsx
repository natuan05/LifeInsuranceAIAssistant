import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
    title: 'AegisLife · Life Insurance Platform',
    description: 'Enterprise Life Insurance and Policyholder Management Platform',
    icons: {
        icon: [
            {
                url: '/favicon.svg',
                type: 'image/svg+xml',
            },
            {
                url: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23059669' stroke-width='2.2'><path d='M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'/></svg>",
                type: 'image/svg+xml',
            },
        ],
    },
};
export default function RootLayout({ children }: Readonly<{
    children: React.ReactNode;
}>) {
    return (<html lang="en" className={"tw:[color-scheme:light] "}>
      <body className={"tw:[:where(&)_*]:box-border tw:m-0 tw:bg-[#f3f6f3] tw:text-portal-ink tw:font-[Arial,Helvetica,sans-serif] "}>{children}</body>
    </html>);
}
