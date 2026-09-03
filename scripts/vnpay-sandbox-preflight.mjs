const enabled = process.env.RUN_VNPAY_SANDBOX_E2E === '1';

if (!enabled) {
  console.log('VNPAY sandbox preflight skipped (set RUN_VNPAY_SANDBOX_E2E=1 to opt in).');
  process.exit(0);
}

const errors = [];
const required = ['VNPAY_TMN_CODE', 'VNPAY_HASH_SECRET', 'VNPAY_RETURN_URL', 'VNPAY_IPN_URL'];
for (const name of required) {
  if (!process.env[name]?.trim()) errors.push(`${name} is required`);
}
if (process.env.VNPAY_ENABLED !== 'true') errors.push('VNPAY_ENABLED must be true');
if ((process.env.VNPAY_ENV ?? 'sandbox') !== 'sandbox') errors.push('VNPAY_ENV must be sandbox');

const expectedPayUrl = 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
const expectedApiUrl = 'https://sandbox.vnpayment.vn/merchant_webapi/api/transaction';
if ((process.env.VNPAY_PAY_URL ?? expectedPayUrl) !== expectedPayUrl) {
  errors.push('VNPAY_PAY_URL must be the VNPAY sandbox payment URL');
}
if ((process.env.VNPAY_API_URL ?? expectedApiUrl) !== expectedApiUrl) {
  errors.push('VNPAY_API_URL must be the VNPAY sandbox transaction URL');
}

function parseUrl(name) {
  try {
    const parsed = new URL(process.env[name] ?? '');
    if (parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error();
    return parsed;
  } catch {
    errors.push(`${name} must be a URL without query, hash, or credentials`);
    return null;
  }
}

const returnUrl = parseUrl('VNPAY_RETURN_URL');
if (
  returnUrl &&
  !(
    returnUrl.protocol === 'http:' &&
    returnUrl.hostname === 'localhost' &&
    returnUrl.port === '3000' &&
    returnUrl.pathname === '/payment/callback'
  )
) {
  errors.push('VNPAY_RETURN_URL must be http://localhost:3000/payment/callback for local demo');
}

const ipnUrl = parseUrl('VNPAY_IPN_URL');
if (
  ipnUrl &&
  (ipnUrl.protocol !== 'https:' ||
    ['localhost', '127.0.0.1', '::1'].includes(ipnUrl.hostname) ||
    !['/api/v1/payment-providers/vnpay/ipn', '/api/v1/callback/payment-callback'].includes(
      ipnUrl.pathname,
    ))
) {
  errors.push('VNPAY_IPN_URL must be a public HTTPS tunnel URL for the VNPAY IPN route');
}

const amount = Number(process.env.VNPAY_SANDBOX_TEST_AMOUNT ?? '5000');
if (!Number.isSafeInteger(amount) || amount < 5_000 || amount > 500_000_000) {
  errors.push('VNPAY_SANDBOX_TEST_AMOUNT must be an integer from 5000 to 500000000 VND');
}
const ttl = Number(process.env.VNPAY_PAYMENT_TTL_SECONDS ?? '600');
if (!Number.isSafeInteger(ttl) || ttl < 60 || ttl > 900) {
  errors.push('VNPAY_PAYMENT_TTL_SECONDS must be an integer from 60 to 900 seconds');
}
const timeout = Number(process.env.VNPAY_HTTP_TIMEOUT_MS ?? '30000');
if (!Number.isSafeInteger(timeout) || timeout < 1_000 || timeout > 120_000) {
  errors.push('VNPAY_HTTP_TIMEOUT_MS must be an integer from 1000 to 120000');
}
if (!['true', 'false', undefined].includes(process.env.AUTH_TRUST_PROXY)) {
  errors.push('AUTH_TRUST_PROXY must be true or false when set');
}

if (errors.length) {
  for (const error of errors) console.error(`[vnpay-preflight] ${error}`);
  process.exit(1);
}

let reachable = 'not checked';
if (ipnUrl) {
  try {
    const response = await fetch(ipnUrl, { signal: AbortSignal.timeout(timeout) });
    reachable = `${response.status} ${response.statusText}`;
  } catch (error) {
    errors.push(
      `VNPAY_IPN_URL is not reachable: ${error instanceof Error ? error.message : 'request failed'}`,
    );
  }
}
if (errors.length) {
  for (const error of errors) console.error(`[vnpay-preflight] ${error}`);
  process.exit(1);
}

console.log('[vnpay-preflight] sandbox configuration is ready (credentials redacted).');
console.log(
  `[vnpay-preflight] IPN host: ${ipnUrl.hostname}; reachability: ${reachable}; test amount: ${amount} VND.`,
);
