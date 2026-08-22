import { Container } from '@shopee-clone/ui';

import { SellerReturnDetailScreen } from '../../../../../components/returns/return-workflows';

export default async function SellerReturnDetailPage({
  params,
}: { params: Promise<{ returnReference: string }> }) {
  const { returnReference } = await params;
  return <Container className="operational-page"><SellerReturnDetailScreen returnReference={returnReference} /></Container>;
}
