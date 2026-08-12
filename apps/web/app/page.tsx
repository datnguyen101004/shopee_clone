import Link from 'next/link';

export default function HomePage() {
  return (
    <main>
      <p className="eyebrow">Shopee Clone</p>
      <h1>Marketplace foundation</h1>
      <p>Next.js frontend and NestJS backend are ready for the first commerce features.</p>
      <Link href="/health">Open frontend health check</Link>
    </main>
  );
}
