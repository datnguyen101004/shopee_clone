import { VnpayPaymentProvider } from './vnpay-payment-provider';
import { VNPAY_SANDBOX_API_URL, VNPAY_SANDBOX_PAY_URL, type VnpayConfig } from './vnpay.config';
import { classifyVnpayResultCode, VnpayResultCodeMetrics } from './vnpay-result-code';
import { canonicalVnpayQuery, signVnpay, verifyVnpay } from './vnpay-signature';

const config: VnpayConfig = {
  enabled: true,
  environment: 'sandbox',
  tmnCode: 'TESTTMNCODE',
  hashSecret: 'test-secret-key',
  payUrl: VNPAY_SANDBOX_PAY_URL,
  returnUrl: 'http://localhost:3000/payment/callback',
  ipnUrl: 'https://example.ngrok-free.app/api/v1/payment-providers/vnpay/ipn',
  apiUrl: VNPAY_SANDBOX_API_URL,
  paymentTtlSeconds: 600,
  httpTimeoutMs: 30_000,
};

describe('VnpayPaymentProvider', () => {
  it('records unmapped result codes without treating them as success', () => {
    const metrics = new VnpayResultCodeMetrics();
    expect(classifyVnpayResultCode(1234, 'OBSERVATION', metrics)).toEqual({
      resultClass: 'UNKNOWN',
      final: false,
    });
    expect(metrics.snapshot()).toEqual({ 'OBSERVATION:1234': 1 });
  });

  it('uses VNPAY form encoding and deterministic lexical ordering', () => {
    const canonical = canonicalVnpayQuery({
      vnp_OrderInfo: 'Thanh toán đơn hàng',
      vnp_Amount: '500000',
      vnp_Empty: '',
      vnp_Alpha: 'a b',
    });
    expect(canonical).toBe(
      'vnp_Alpha=a+b&vnp_Amount=500000&vnp_OrderInfo=Thanh+to%C3%A1n+%C4%91%C6%A1n+h%C3%A0ng',
    );
    const signature = signVnpay('fixture-secret', canonical);
    expect(verifyVnpay('fixture-secret', canonical, signature)).toBe(true);
    expect(verifyVnpay('fixture-secret', `${canonical}&vnp_Amount=1`, signature)).toBe(false);
    expect(verifyVnpay('fixture-secret', canonical, `${signature.slice(0, -1)}x`)).toBe(false);
  });

  it('creates an allowlisted signed hosted URL from integer VND amount', async () => {
    const provider = new VnpayPaymentProvider(config);
    const result = await provider.createPayment({
      provider: 'VNPAY',
      environment: 'SANDBOX',
      orderId: 'vnpay_attempt_123',
      requestId: 'req_123',
      amountMinor: 100_000n,
      currency: 'VND',
      orderInfo: 'Demo order',
      redirectUrl: config.returnUrl!,
      ipnUrl: config.ipnUrl!,
      expiresAt: new Date(Date.now() + 600_000),
      createdAt: new Date('2026-09-01T05:00:00.000Z'),
      clientIp: '203.0.113.8',
    });
    expect(result.paymentStatus).toBe('PENDING');
    expect(result.instructions.payUrl).toMatch(
      /^https:\/\/sandbox\.vnpayment\.vn\/paymentv2\/vpcpay\.html\?/,
    );
    expect(result.instructions.payUrl).toContain('vnp_Amount=10000000');
    expect(result.instructions.payUrl).toContain('vnp_ExpireDate=');
    expect(result.instructions.payUrl).toContain('vnp_IpAddr=203.0.113.8');
    expect(result.instructions.payUrl).toContain('vnp_SecureHash=');
  });

  it('replays the same signed URL from immutable attempt timestamps', async () => {
    const provider = new VnpayPaymentProvider(config);
    const command = {
      provider: 'VNPAY' as const,
      environment: 'SANDBOX' as const,
      orderId: 'vnpay_attempt_replay',
      requestId: 'req_replay',
      amountMinor: 100_000n,
      currency: 'VND' as const,
      orderInfo: 'Demo order',
      redirectUrl: config.returnUrl!,
      ipnUrl: config.ipnUrl!,
      createdAt: new Date('2026-09-01T05:00:00.000Z'),
      expiresAt: new Date('2026-09-01T05:10:00.000Z'),
      clientIp: '203.0.113.8',
    };
    const first = await provider.createPayment(command);
    const replay = await provider.createPayment(command);
    expect(replay.instructions.payUrl).toBe(first.instructions.payUrl);
  });

  it('queries and verifies a signed successful VNPAY transaction result', async () => {
    const responseFields = {
      vnp_ResponseId: 'response-123',
      vnp_Command: 'querydr',
      vnp_ResponseCode: '00',
      vnp_Message: 'Success',
      vnp_TmnCode: config.tmnCode!,
      vnp_TxnRef: 'vnpay_attempt_123',
      vnp_Amount: '10000000',
      vnp_BankCode: 'NCB',
      vnp_PayDate: '20260901220500',
      vnp_TransactionNo: '123456',
      vnp_TransactionType: '01',
      vnp_TransactionStatus: '00',
      vnp_OrderInfo: 'Thanh toan don hang',
      vnp_PromotionCode: '',
      vnp_PromotionAmount: '',
    };
    const signatureInput = [
      responseFields.vnp_ResponseId,
      responseFields.vnp_Command,
      responseFields.vnp_ResponseCode,
      responseFields.vnp_Message,
      responseFields.vnp_TmnCode,
      responseFields.vnp_TxnRef,
      responseFields.vnp_Amount,
      responseFields.vnp_BankCode,
      responseFields.vnp_PayDate,
      responseFields.vnp_TransactionNo,
      responseFields.vnp_TransactionType,
      responseFields.vnp_TransactionStatus,
      responseFields.vnp_OrderInfo,
      responseFields.vnp_PromotionCode,
      responseFields.vnp_PromotionAmount,
    ].join('|');
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ...responseFields,
          vnp_SecureHash: signVnpay(config.hashSecret!, signatureInput),
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const provider = new VnpayPaymentProvider(config);

    await expect(
      provider.queryPayment({
        provider: 'VNPAY',
        environment: 'SANDBOX',
        orderId: 'vnpay_attempt_123',
        requestId: 'request_123',
        transactionDate: new Date('2026-09-01T15:00:00.000Z'),
        queryRequestedAt: new Date('2026-09-01T15:10:00.000Z'),
        clientIp: '203.0.113.8',
      }),
    ).resolves.toMatchObject({
      provider: 'VNPAY',
      orderId: 'vnpay_attempt_123',
      amountMinor: 100_000n,
      resultCode: 0,
      providerTransactionId: 123_456n,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = fetchMock.mock.calls[0]![1]!;
    const requestBody = JSON.parse(String(request.body)) as Record<string, string>;
    expect(requestBody).toMatchObject({
      vnp_Command: 'querydr',
      vnp_TxnRef: 'vnpay_attempt_123',
      vnp_TransactionDate: '20260901220000',
      vnp_CreateDate: '20260901221000',
      vnp_IpAddr: '203.0.113.8',
    });
    expect(requestBody.vnp_RequestId).toMatch(/^[0-9a-f]{32}$/);
    expect(requestBody.vnp_SecureHash).toMatch(/^[0-9a-f]{128}$/);
    fetchMock.mockRestore();
  });

  it('verifies a success IPN without requiring a buyer session', () => {
    const provider = new VnpayPaymentProvider(config);
    const fields = {
      vnp_Amount: '10000000',
      vnp_BankCode: 'NCB',
      vnp_BankTranNo: 'VNP123456',
      vnp_CardType: 'ATM',
      vnp_OrderInfo: 'Thanh toan don hang',
      vnp_PayDate: '20260901220500',
      vnp_ResponseCode: '00',
      vnp_TmnCode: config.tmnCode!,
      vnp_TransactionNo: '123456',
      vnp_TransactionStatus: '00',
      vnp_TxnRef: 'vnpay_attempt_123',
      vnp_Version: '2.1.0',
    };
    const signature = signVnpay(config.hashSecret!, canonicalVnpayQuery(fields));
    const result = provider.verifyNotification({ fields, signature, receivedAt: new Date() });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.observation.provider).toBe('VNPAY');
      expect(result.observation.amountMinor).toBe(100_000n);
      expect(result.observation.resultCode).toBe(0);
    }
  });

  it('treats VNPAY transaction number 0 as absent for a cancelled return', () => {
    const provider = new VnpayPaymentProvider(config);
    const fields = {
      vnp_Amount: '10000000',
      vnp_BankCode: 'VNPAY',
      vnp_CardType: 'QRCODE',
      vnp_OrderInfo: 'Thanh toan don hang',
      vnp_PayDate: '20260901220500',
      vnp_ResponseCode: '24',
      vnp_TmnCode: config.tmnCode!,
      vnp_TransactionNo: '0',
      vnp_TransactionStatus: '02',
      vnp_TxnRef: 'vnpay_attempt_123',
    };
    const signature = signVnpay(config.hashSecret!, canonicalVnpayQuery(fields));
    const result = provider.verifyNotification({ fields, signature, receivedAt: new Date() });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.observation.resultCode).toBe(24);
      expect(result.observation.providerTransactionId).toBeNull();
    }
  });

  it('rejects contradictory command or currency fields when a sender includes them', () => {
    const provider = new VnpayPaymentProvider(config);
    const fields = {
      vnp_Amount: '10000000',
      vnp_Command: 'querydr',
      vnp_CurrCode: 'USD',
      vnp_ResponseCode: '00',
      vnp_TmnCode: config.tmnCode!,
      vnp_TransactionNo: '123456',
      vnp_TransactionStatus: '00',
      vnp_TxnRef: 'vnpay_attempt_123',
    };
    const signature = signVnpay(config.hashSecret!, canonicalVnpayQuery(fields));
    expect(provider.verifyNotification({ fields, signature, receivedAt: new Date() })).toEqual({
      valid: false,
      reason: 'MALFORMED',
    });
  });

  it('does not classify response 00 as success when transaction status is non-zero', () => {
    const provider = new VnpayPaymentProvider(config);
    const fields = {
      vnp_Amount: '10000000',
      vnp_ResponseCode: '00',
      vnp_TmnCode: config.tmnCode!,
      vnp_TransactionNo: '123456',
      vnp_TransactionStatus: '01',
      vnp_TxnRef: 'vnpay_attempt_123',
      vnp_Version: '2.1.0',
    };
    const signature = signVnpay(config.hashSecret!, canonicalVnpayQuery(fields));
    const result = provider.verifyNotification({ fields, signature, receivedAt: new Date() });
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.observation.resultCode).toBe(99);
  });
});
