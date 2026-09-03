import { PurchaseSuccessScreen } from '../../../../../components/checkout/purchase-success-screen';

export default async function CheckoutSuccessPage({
  params,
}: PageProps<'/checkout/success/[purchaseReference]'>) {
  const { purchaseReference } = await params;
  return <PurchaseSuccessScreen purchaseReference={purchaseReference} />;
}
