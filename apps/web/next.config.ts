import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  allowedDevOrigins: ['127.0.0.1'],
  devIndicators: false,
  images: {
    maximumRedirects: 0,
    remotePatterns: [
      'cdn.hstatic.net',
      'cdnv2.tgdd.vn',
      'dienthoaihay.vn',
      'myshoes.vn',
      'product.hstatic.net',
      'static.spacet.vn',
    ].map((hostname) => ({ protocol: 'https' as const, hostname, pathname: '/**' })),
  },
  transpilePackages: ['@shopee-clone/contracts', '@shopee-clone/ui'],
};

export default nextConfig;
