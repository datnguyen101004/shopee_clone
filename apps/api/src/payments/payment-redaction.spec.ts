import { sanitizePaymentProviderError, sanitizePaymentTelemetry } from './payment-redaction';
import { ProviderMalformedResponseError } from './payment-result';

describe('payment telemetry redaction', () => {
  const sentinels = [
    'super-secret-key',
    'full-access-key',
    'raw-signature',
    'raw-provider-payload',
    'buyer@example.test',
    '0900000000',
    'Nguyen Van Buyer',
    'https://test-payment.momo.vn/pay?token=full-payment-token',
    'momo://pay?token=full-deeplink-token',
    '000201-full-qr-payload',
  ];

  it('copies only safe structured fields and converts instructions to presence flags', () => {
    const telemetry = sanitizePaymentTelemetry({
      operation: 'CREATE',
      provider: 'MOMO',
      environment: 'SANDBOX',
      paymentReference: 'payment-reference-1',
      orderId: 'opaque-order-1',
      requestId: 'opaque-request-1',
      resultCode: 0,
      resultClass: 'PENDING',
      status: 'PENDING',
      durationMs: 250,
      duplicate: false,
      signatureValid: true,
      secretKey: sentinels[0],
      accessKey: sentinels[1],
      signature: sentinels[2],
      rawPayload: sentinels[3],
      email: sentinels[4],
      phone: sentinels[5],
      displayName: sentinels[6],
      payUrl: sentinels[7],
      deeplink: sentinels[8],
      qrCodeUrl: sentinels[9],
    });

    expect(telemetry).toEqual({
      operation: 'CREATE',
      provider: 'MOMO',
      environment: 'SANDBOX',
      paymentReference: 'payment-reference-1',
      orderId: 'opaque-order-1',
      requestId: 'opaque-request-1',
      resultCode: 0,
      resultClass: 'PENDING',
      status: 'PENDING',
      durationMs: 250,
      duplicate: false,
      signatureValid: true,
      hasPayUrl: true,
      hasDeeplink: true,
      hasQrCode: true,
    });
    const serialized = JSON.stringify(telemetry);
    for (const sentinel of sentinels) expect(serialized).not.toContain(sentinel);
  });

  it('never copies an exception message that may contain raw provider data', () => {
    const error = new ProviderMalformedResponseError(
      `bad response ${sentinels.join(' ')} raw-signature`,
    );
    const safe = sanitizePaymentProviderError(error);
    expect(safe).toEqual({
      code: 'PROVIDER_MALFORMED_RESPONSE',
      retryable: true,
      outcomeUnknown: true,
    });
    const serialized = JSON.stringify(safe);
    for (const sentinel of sentinels) expect(serialized).not.toContain(sentinel);
  });

  it('redacts VNPAY credentials, hashes, signed URLs, bank data, and raw callbacks', () => {
    const vnpaySecrets = [
      'YAGTIIYEMTPOWJFCHDZZTUPETFOBHLMP',
      'abcdef0123456789'.repeat(8),
      'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?vnp_SecureHash=secret',
      'vnp_BankTranNo=bank-secret&vnp_CardType=ATM',
      'buyer@example.test',
    ];
    const telemetry = sanitizePaymentTelemetry({
      provider: 'VNPAY',
      environment: 'SANDBOX',
      operation: 'IPN',
      orderId: 'opaque-vnpay-order',
      requestId: 'opaque-vnpay-request',
      rawQuery: vnpaySecrets[3],
      hashSecret: vnpaySecrets[0],
      vnpSecureHash: vnpaySecrets[1],
      payUrl: vnpaySecrets[2],
      email: vnpaySecrets[4],
    });
    const serialized = JSON.stringify(telemetry);
    for (const secret of vnpaySecrets) expect(serialized).not.toContain(secret);
    expect(telemetry).toMatchObject({ provider: 'VNPAY', operation: 'IPN', hasPayUrl: true });
  });
});
