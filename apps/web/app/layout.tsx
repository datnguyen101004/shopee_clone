import type { Metadata } from 'next';
import { Be_Vietnam_Pro } from 'next/font/google';
import type { ReactNode } from 'react';
import { ToastProvider } from '@shopee-clone/ui';

import '@shopee-clone/ui/styles.css';
import './globals.css';

const beVietnamPro = Be_Vietnam_Pro({
  subsets: ['latin', 'vietnamese'],
  weight: ['300', '400', '500', '600', '700', '800'],
  variable: '--font-be-vietnam-pro',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Shopee Clone - Mua Sắm Trực Tuyến',
  description: 'Trải nghiệm mua sắm trực tuyến chuẩn Shopee Clone giá tốt, hàng ngàn ưu đãi',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="vi" className={beVietnamPro.variable}>
      <body className={beVietnamPro.className}>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
