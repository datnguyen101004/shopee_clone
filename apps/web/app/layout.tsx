import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ToastProvider } from '@shopee-clone/ui';

import '@shopee-clone/ui/styles.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Shopee Clone Marketplace',
  description: 'Trải nghiệm mua sắm trực tuyến lấy cảm hứng từ Shopee',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="vi">
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
