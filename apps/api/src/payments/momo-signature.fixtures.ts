import type { MomoCreateSignatureInput, MomoIpnSignatureInput } from './momo-signature';

export const MOMO_SIGNATURE_FIXTURE_SECRET = 'test-secret-key-1234567890';

export const MOMO_CREATE_SIGNATURE_FIXTURE: {
  input: MomoCreateSignatureInput;
  canonical: string;
  signature: string;
} = {
  input: {
    accessKey: 'sandbox-access',
    amount: 150_000,
    extraData: 'eyJjYXJ0IjoiMTIzIn0=',
    ipnUrl: 'https://api.example.test/api/v1/payment-providers/momo/ipn',
    orderId: 'ord_20260828',
    orderInfo: 'Thanh toan don hang',
    partnerCode: 'MOMO_TEST',
    redirectUrl: 'https://shop.example.test/checkout/payment/result',
    requestId: 'req_20260828',
    requestType: 'captureWallet',
  },
  canonical:
    'accessKey=sandbox-access&amount=150000&extraData=eyJjYXJ0IjoiMTIzIn0=' +
    '&ipnUrl=https://api.example.test/api/v1/payment-providers/momo/ipn' +
    '&orderId=ord_20260828&orderInfo=Thanh toan don hang&partnerCode=MOMO_TEST' +
    '&redirectUrl=https://shop.example.test/checkout/payment/result' +
    '&requestId=req_20260828&requestType=captureWallet',
  signature: 'acd9f871554bf6f09ed53fb6dfd9dc0137692dc263eb66b977b95579d95ef8df',
};

export const MOMO_IPN_SIGNATURE_FIXTURE: {
  input: MomoIpnSignatureInput;
  canonical: string;
  signature: string;
} = {
  input: {
    accessKey: 'sandbox-access',
    amount: 150_000,
    extraData: '',
    message: 'Successful.',
    orderId: 'ord_20260828',
    orderInfo: 'Thanh toan don hang',
    orderType: 'momo_wallet',
    partnerCode: 'MOMO_TEST',
    payType: 'qr',
    requestId: 'req_20260828',
    responseTime: 1_787_932_800_000,
    resultCode: 0,
    transId: 700_000_123_456n,
  },
  canonical:
    'accessKey=sandbox-access&amount=150000&extraData=&message=Successful.' +
    '&orderId=ord_20260828&orderInfo=Thanh toan don hang&orderType=momo_wallet' +
    '&partnerCode=MOMO_TEST&payType=qr&requestId=req_20260828' +
    '&responseTime=1787932800000&resultCode=0&transId=700000123456',
  signature: 'c096ae526b15b98f8975343d71c7a739f63b9bfee26a4efdfa73fae220c3e1da',
};
