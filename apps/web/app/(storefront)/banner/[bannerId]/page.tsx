import { Container } from '@shopee-clone/ui';
import { notFound, redirect } from 'next/navigation';

type LegacyBannerTarget = { id?: string };

export default async function BannerDetailRoute({ params }: { params: Promise<{ bannerId: string }> }) {
  const { bannerId } = await params;
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';
  let response: Response;
  try {
    response = await fetch(`${apiBase}/api/v1/campaigns/by-banner/${encodeURIComponent(bannerId)}`, { cache: 'no-store' });
  } catch {
    notFound();
  }
  if (!response!.ok) notFound();
  const target = await response!.json() as LegacyBannerTarget;
  if (!target.id) notFound();
  redirect(`/campaigns/${encodeURIComponent(target.id)}`);
  return <Container className="operational-page" />;
}
