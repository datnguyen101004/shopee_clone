import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  allowedDevOrigins: ['127.0.0.1'],
  devIndicators: false,
  transpilePackages: ['@shopee-clone/contracts', '@shopee-clone/ui'],
};

export default nextConfig;
