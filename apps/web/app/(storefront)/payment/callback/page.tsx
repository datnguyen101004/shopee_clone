import { VnpayCallbackScreen } from '../../../../components/checkout/vnpay-callback-screen';

export default async function VnpayCallbackPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = params.vnp_TxnRef;
  const transactionReference =
    typeof raw === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(raw) ? raw : null;
  const callbackFields = Object.fromEntries(
    Object.entries(params).flatMap(([key, value]) =>
      key.startsWith('vnp_') && typeof value === 'string' ? [[key, value]] : [],
    ),
  );
  return (
    <VnpayCallbackScreen
      transactionReference={transactionReference}
      callbackFields={callbackFields}
    />
  );
}
