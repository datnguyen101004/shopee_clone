import { AdminCampaignDetailPage } from '../../../../../components/admin/admin-entity-detail-pages';

export default async function AdminCampaignDetailRoute({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  return <AdminCampaignDetailPage campaignId={campaignId} />;
}
