const enabled = process.env.RUN_MOMO_SANDBOX_E2E === '1';

if (!enabled) {
  console.log('MoMo sandbox preflight skipped (set RUN_MOMO_SANDBOX_E2E=1 to opt in).');
  process.exit(0);
}

const errors = [];
const required = ['MOMO_PARTNER_CODE', 'MOMO_ACCESS_KEY', 'MOMO_SECRET_KEY'];
for (const name of required) {
  if (!process.env[name]?.trim()) errors.push(`${name} is required`);
}
if (process.env.MOMO_ENV !== 'sandbox') errors.push('MOMO_ENV must be sandbox');

function publicHttps(name) {
  const value = process.env[name];
  try {
    const parsed = new URL(value ?? '');
    if (parsed.protocol !== 'https:') throw new Error();
    if (['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)) throw new Error();
    return parsed;
  } catch {
    errors.push(`${name} must be a public HTTPS URL`);
    return null;
  }
}

const ipn = publicHttps('MOMO_IPN_URL');
publicHttps('MOMO_REDIRECT_URL');
if (ipn && ipn.pathname !== '/api/v1/payment-providers/momo/ipn') {
  errors.push('MOMO_IPN_URL must end with /api/v1/payment-providers/momo/ipn');
}
const amount = Number(process.env.MOMO_SANDBOX_TEST_AMOUNT ?? '1000');
if (!Number.isSafeInteger(amount) || amount < 1_000 || amount > 50_000_000) {
  errors.push('MOMO_SANDBOX_TEST_AMOUNT must be an integer from 1000 to 50000000 VND');
}
const timeout = Number(process.env.MOMO_HTTP_TIMEOUT_MS ?? '30000');
if (!Number.isSafeInteger(timeout) || timeout < 30_000) {
  errors.push('MOMO_HTTP_TIMEOUT_MS must be at least 30000');
}

if (errors.length) {
  for (const error of errors) console.error(`[momo-preflight] ${error}`);
  process.exit(1);
}
console.log('[momo-preflight] sandbox configuration is ready (credentials redacted).');
console.log(`[momo-preflight] IPN host: ${ipn.hostname}; test amount: ${amount} VND.`);
