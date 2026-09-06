import { Container } from '@shopee-clone/ui';
import { CampaignDetailPage } from '../../../../components/campaign-detail-page';

export default async function CampaignDetailRoute({ params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params;
  return <Container className="operational-page"><CampaignDetailPage campaignId={campaignId} /></Container>;
}
