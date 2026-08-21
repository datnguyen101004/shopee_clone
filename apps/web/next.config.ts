import type { NextConfig } from 'next';

const s3Bucket =
  process.env.AWS_S3_BUCKET ?? process.env.AWS_S3_BUCKET_NAME ?? process.env.AWS_BUCKET_NAME;
const s3Region = process.env.AWS_S3_REGION ?? process.env.AWS_REGION ?? 'us-east-1';
const s3Hostname = s3Bucket
  ? s3Region === 'us-east-1'
    ? `${s3Bucket}.s3.amazonaws.com`
    : `${s3Bucket}.s3.${s3Region}.amazonaws.com`
  : undefined;

const catalogImageHostnames = [
  'cdn.hstatic.net',
  'cdnv2.tgdd.vn',
  'dienthoaihay.vn',
  'myshoes.vn',
  'product.hstatic.net',
  'static.spacet.vn',
];

const nextConfig: NextConfig = {
  output: 'standalone',
  allowedDevOrigins: ['127.0.0.1'],
  devIndicators: false,
  images: {
    maximumRedirects: 0,
    remotePatterns: [
      ...catalogImageHostnames.map((hostname) => ({
        protocol: 'https' as const,
        hostname,
        pathname: '/**',
      })),
      // Keep S3 media working even when the workspace-level .env is not loaded
      // by Next.js (the web app lives in apps/web in this monorepo).
      {
        protocol: 'https' as const,
        hostname: '**.amazonaws.com',
        pathname: '/seller-product-media/**',
      },
      ...(s3Hostname
        ? [
            {
              protocol: 'https' as const,
              hostname: s3Hostname,
              pathname: '/**',
            },
          ]
        : []),
    ],
  },
  transpilePackages: ['@shopee-clone/contracts', '@shopee-clone/ui'],
};

export default nextConfig;
