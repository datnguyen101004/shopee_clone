import { readFile } from 'node:fs/promises';

const input = process.argv[2] || process.env.POC_RESULT_PATH;
if (!input) throw new Error('Usage: node scripts/poc/t35/verify.mjs <result.json>');
const result = JSON.parse(await readFile(input, 'utf8'));
const failures = [];
const number = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const observed = result.observed || result;

if (number(observed.peakActiveLeases) > 20)
  failures.push(`peakActiveLeases=${observed.peakActiveLeases} exceeds 20`);
if (number(observed.peakExecutingConfirmations) > 5)
  failures.push(`peakExecutingConfirmations=${observed.peakExecutingConfirmations} exceeds 5`);
if (number(observed.duplicateOrders) > 0)
  failures.push(`duplicateOrders=${observed.duplicateOrders}`);
if (number(observed.duplicateReversals) > 0)
  failures.push(`duplicateReversals=${observed.duplicateReversals}`);
if (number(observed.negativeQuotaRows) > 0)
  failures.push(`negativeQuotaRows=${observed.negativeQuotaRows}`);
if (number(observed.negativeStockRows) > 0)
  failures.push(`negativeStockRows=${observed.negativeStockRows}`);
if (observed.lambdaInvocations !== undefined && number(observed.lambdaInvocations) < 1)
  failures.push('lambdaInvocations must be recorded and greater than zero');
if (observed.pollingQueriesCheckout !== undefined && number(observed.pollingQueriesCheckout) > 0)
  failures.push(`pollingQueriesCheckout=${observed.pollingQueriesCheckout}`);

const report = {
  runId: result.runId || null,
  status: failures.length ? 'FAIL' : 'PASS',
  failures,
  checkedAt: new Date().toISOString(),
};
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
