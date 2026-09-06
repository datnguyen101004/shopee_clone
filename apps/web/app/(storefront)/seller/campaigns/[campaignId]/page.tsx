import { SellerCampaignsPage } from '../../../../../components/seller-campaigns-page';
export default async function SellerCampaignDetailRoute({ params }: { params: Promise<{ campaignId: string }> }) { const { campaignId } = await params; return <SellerCampaignsPage campaignId={campaignId} />; }
