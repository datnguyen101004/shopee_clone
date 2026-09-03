import {
  buildMomoCreateCanonical,
  buildMomoIpnCanonical,
  buildMomoQueryCanonical,
  buildMomoRefundCanonical,
  signMomoCanonical,
  verifyMomoSignature,
} from './momo-signature';
import {
  MOMO_CREATE_SIGNATURE_FIXTURE,
  MOMO_IPN_SIGNATURE_FIXTURE,
  MOMO_SIGNATURE_FIXTURE_SECRET,
} from './momo-signature.fixtures';

describe('MoMo canonical signatures', () => {
  it('builds create fields in the documented order', () => {
    expect(
      buildMomoCreateCanonical({
        accessKey: 'access',
        amount: 1000,
        extraData: '',
        ipnUrl: 'https://api.example.test/ipn',
        orderId: 'order-1',
        orderInfo: 'Order one',
        partnerCode: 'partner',
        redirectUrl: 'https://shop.example.test/result',
        requestId: 'request-1',
        requestType: 'captureWallet',
      }),
    ).toBe(
      'accessKey=access&amount=1000&extraData=&ipnUrl=https://api.example.test/ipn' +
        '&orderId=order-1&orderInfo=Order one&partnerCode=partner' +
        '&redirectUrl=https://shop.example.test/result&requestId=request-1&requestType=captureWallet',
    );
  });

  it('builds IPN fields in the documented order', () => {
    expect(
      buildMomoIpnCanonical({
        accessKey: 'access',
        amount: 1000,
        extraData: '',
        message: 'Successful.',
        orderId: 'order-1',
        orderInfo: 'Order one',
        orderType: 'momo_wallet',
        partnerCode: 'partner',
        payType: 'qr',
        requestId: 'request-1',
        responseTime: 1660000000000,
        resultCode: 0,
        transId: 7000001n,
      }),
    ).toBe(
      'accessKey=access&amount=1000&extraData=&message=Successful.&orderId=order-1' +
        '&orderInfo=Order one&orderType=momo_wallet&partnerCode=partner&payType=qr' +
        '&requestId=request-1&responseTime=1660000000000&resultCode=0&transId=7000001',
    );
  });

  it('builds query and refund fields in their documented order', () => {
    expect(
      buildMomoQueryCanonical({
        accessKey: 'access',
        orderId: 'order-1',
        partnerCode: 'partner',
        requestId: 'request-1',
      }),
    ).toBe('accessKey=access&orderId=order-1&partnerCode=partner&requestId=request-1');
    expect(
      buildMomoRefundCanonical({
        accessKey: 'access',
        amount: 1000,
        description: 'Full refund',
        orderId: 'refund-1',
        partnerCode: 'partner',
        requestId: 'refund-request-1',
        transId: 7000001n,
      }),
    ).toBe(
      'accessKey=access&amount=1000&description=Full refund&orderId=refund-1' +
        '&partnerCode=partner&requestId=refund-request-1&transId=7000001',
    );
  });

  it('signs with HMAC-SHA256 and rejects malformed signatures before constant-time comparison', () => {
    const signature = signMomoCanonical('secret', 'accessKey=access&orderId=order-1');
    expect(signature).toMatch(/^[0-9a-f]{64}$/);
    expect(verifyMomoSignature('secret', 'accessKey=access&orderId=order-1', signature)).toBe(true);
    expect(
      verifyMomoSignature('secret', 'accessKey=access&orderId=order-1', signature.toUpperCase()),
    ).toBe(true);
    expect(verifyMomoSignature('secret', 'accessKey=access&orderId=order-1', 'abcd')).toBe(false);
    expect(verifyMomoSignature('wrong', 'accessKey=access&orderId=order-1', signature)).toBe(false);
  });

  it('matches fixed create and IPN signature fixtures', () => {
    expect(buildMomoCreateCanonical(MOMO_CREATE_SIGNATURE_FIXTURE.input)).toBe(
      MOMO_CREATE_SIGNATURE_FIXTURE.canonical,
    );
    expect(
      signMomoCanonical(MOMO_SIGNATURE_FIXTURE_SECRET, MOMO_CREATE_SIGNATURE_FIXTURE.canonical),
    ).toBe(MOMO_CREATE_SIGNATURE_FIXTURE.signature);
    expect(buildMomoIpnCanonical(MOMO_IPN_SIGNATURE_FIXTURE.input)).toBe(
      MOMO_IPN_SIGNATURE_FIXTURE.canonical,
    );
    expect(
      signMomoCanonical(MOMO_SIGNATURE_FIXTURE_SECRET, MOMO_IPN_SIGNATURE_FIXTURE.canonical),
    ).toBe(MOMO_IPN_SIGNATURE_FIXTURE.signature);
  });

  it.each([
    [
      'field order',
      MOMO_CREATE_SIGNATURE_FIXTURE.canonical.replace(
        'amount=150000&extraData=',
        'extraData=&amount=150000',
      ),
    ],
    [
      'encoding',
      MOMO_CREATE_SIGNATURE_FIXTURE.canonical.replace(
        'Thanh toan don hang',
        'Thanh%20toan%20don%20hang',
      ),
    ],
    [
      'missing field',
      MOMO_CREATE_SIGNATURE_FIXTURE.canonical.replace('&extraData=eyJjYXJ0IjoiMTIzIn0=', ''),
    ],
  ])('rejects a signature after %s changes', (_case, changedCanonical) => {
    expect(
      verifyMomoSignature(
        MOMO_SIGNATURE_FIXTURE_SECRET,
        changedCanonical,
        MOMO_CREATE_SIGNATURE_FIXTURE.signature,
      ),
    ).toBe(false);
  });

  it('rejects wrong signature length and wrong secret', () => {
    expect(
      verifyMomoSignature(
        MOMO_SIGNATURE_FIXTURE_SECRET,
        MOMO_CREATE_SIGNATURE_FIXTURE.canonical,
        MOMO_CREATE_SIGNATURE_FIXTURE.signature.slice(2),
      ),
    ).toBe(false);
    expect(
      verifyMomoSignature(
        'wrong-test-secret-key',
        MOMO_CREATE_SIGNATURE_FIXTURE.canonical,
        MOMO_CREATE_SIGNATURE_FIXTURE.signature,
      ),
    ).toBe(false);
  });
});
