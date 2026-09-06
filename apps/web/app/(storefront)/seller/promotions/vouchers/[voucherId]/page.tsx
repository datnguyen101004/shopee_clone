import { SellerVoucherDetail } from '../../../../../../components/seller-voucher-detail';

export default async function SellerVoucherDetailPage({
  params,
}: {
  params: Promise<{ voucherId: string }>;
}) {
  const { voucherId } = await params;
  return <SellerVoucherDetail voucherId={voucherId} />;
}
