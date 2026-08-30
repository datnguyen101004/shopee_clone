import { MomoPaymentScreen } from '../../../../../components/checkout/momo-payment-screen';

export default async function PaymentPage({
  params,
}: {
  params: Promise<{ paymentReference: string }>;
}) {
  const { paymentReference } = await params;
  return <MomoPaymentScreen paymentReference={paymentReference} />;
}
