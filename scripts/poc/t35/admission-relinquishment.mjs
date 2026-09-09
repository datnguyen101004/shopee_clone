#!/usr/bin/env node

/**
 * T35 admission relinquishment POC.
 *
 * This is deliberately a Node runner instead of a browser/E2E test. It keeps
 * the HttpOnly admission cookie returned by the real API per buyer and emits
 * one JSON event stream plus a Markdown summary. No credentials are written
 * to the output artifacts.
 *
 * Safety: the runner is preflight-only unless --run is supplied. It never
 * creates users, carts, SKUs, or changes quota. Use the API-side provisioner
 * and a local-only fixture before running it.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { basename, resolve } from 'node:path';

const CONFIG = {
  buyers: 100,
  skuQuota: 10,
  admissionPool: 40,
  confirmationConcurrency: 5,
  relinquishBatch: 10,
  relinquishIntervalMs: 2_000,
  relinquishWaves: 6,
  finalWaveBuyers: 10,
  finalRemainingQuota: 5,
  requestTimeoutMs: 10_000,
  pollIntervalMs: 500,
  admissionWaitTimeoutMs: 45_000,
  confirmationRetryLimit: 4,
  confirmationRetryDelayMs: 350,
};

const args = new Set(process.argv.slice(2));
const runRequested = args.has('--run');
const fixturePath = resolve(
  process.env.T35_ADMISSION_FIXTURE ??
    process.env.FIXTURE_PATH ??
    './scripts/poc/t35/fixtures.local.json',
);
const resultDir = resolve(
  process.env.T35_ADMISSION_RESULT_DIR ?? './result/t35-admission-100-buyers-40-leases-10-stock',
);
const runId = (process.env.T35_ADMISSION_RUN_ID ?? randomUUID())
  .replace(/[^A-Za-z0-9_-]/g, '')
  .slice(0, 48);
const baseUrl = (
  process.env.T35_POC_BASE_URL ??
  process.env.BASE_URL ??
  'http://127.0.0.1:3001/api/v1'
).replace(/\/$/, '');
const origin = process.env.T35_POC_ORIGIN ?? 'http://localhost:3000';
const databaseUrl = (process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL)?.trim() ?? '';
const redisUrl = process.env.REDIS_URL?.trim() ?? 'redis://127.0.0.1:6379';
const localstackUrl = (process.env.ADMISSION_SQS_ENDPOINT ?? 'http://127.0.0.1:4566').replace(
  /\/$/,
  '',
);

const startedAt = new Date().toISOString();
const report = {
  schemaVersion: 't35-admission-relinquishment-v1',
  runId,
  status: runRequested ? 'NOT_RUN' : 'NOT_RUN',
  startedAt,
  finishedAt: null,
  mode: runRequested ? 'run' : 'preflight-only',
  fixture: { path: fixturePath, userCount: 0, sku: null },
  config: { ...CONFIG },
  prerequisites: {},
  serviceDownMatrix: {},
  architectureFailureAssessment: [
    {
      service: 'SQS',
      impact:
        'New queue delivery pauses. Existing admitted leases and in-flight checkout remain usable, but WAITING tickets may not progress through the Lambda delivery path until SQS recovers.',
      safety:
        'Redis ticket/idempotency state prevents duplicate grants when SQS redelivers duplicate or previously invisible messages.',
      recovery:
        'SQS Standard redelivers unacknowledged messages after visibility timeout; recovery is bounded by visibility/backoff and message retention, not polling.',
    },
    {
      service: 'Lambda',
      impact:
        'SQS can retain ticket messages, but the Lambda grant consumer stops. Existing admitted buyers can still preview/confirm while new WAITING tickets accumulate.',
      safety:
        'No process-local token fallback is introduced; duplicate invocation remains fenced by Redis ticket state.',
      recovery:
        'Queued messages are retried when Lambda is available again. Expiry/page-leave reapers also call grantWaiting immediately after reclaiming capacity, but cannot replace initial message delivery indefinitely.',
    },
    {
      service: 'Redis',
      impact:
        'Admission join/status/token validation, lease accounting and confirmation-slot admission fail closed; Flash Sale checkout availability is interrupted.',
      safety:
        'PostgreSQL remains the durable order/quota authority, so the system does not grant unverified purchases or knowingly oversell.',
      recovery:
        'Automatic Redis cache-loss rebuilding/reconciliation is explicitly deferred in this POC. Redis is therefore the highest-availability-risk dependency.',
    },
    {
      service: 'PostgreSQL',
      impact:
        'Tickets and leases may still exist in Redis, but order creation and durable quota/claim persistence stop.',
      safety:
        'Checkout fails instead of treating Redis admission as a purchase guarantee; owned provisional attempts are compensated only after a definitive rollback.',
      recovery:
        'Database recovery is outside this POC; idempotency/result lookup must resolve any ambiguous commit before retry compensation.',
    },
  ],
  phases: [],
  buyers: [],
  preflightSnapshot: null,
  initialSnapshot: null,
  observed: {
    peakActiveLeases: null,
    peakPendingReleases: null,
    minimumConfirmationSlotsAvailable: null,
    peakExecutingConfirmations: null,
    seedSuccessfulOrders: 0,
    finalSuccessfulOrders: 0,
    finalBusyResponses: 0,
    finalConflictResponses: 0,
    finalUnsuccessfulBuyers: 0,
    finalSoldOutResponses: 0,
    relinquishedBuyers: 0,
    cleanupReleasedLeases: 0,
    duplicateOrders: null,
  },
  finalSnapshot: null,
  finalInvariants: [],
  failureAnalysis: [],
};

function nowMs() {
  return Date.now();
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function iso(ms = nowMs()) {
  return new Date(ms).toISOString();
}

function safeStatus(value) {
  return Number.isInteger(value) ? value : null;
}

function phase(name, description) {
  const item = {
    name,
    description,
    startedAt: iso(),
    endedAt: null,
    durationMs: null,
    details: {},
  };
  report.phases.push(item);
  return item;
}

function finishPhase(item, details = {}) {
  item.endedAt = iso();
  item.durationMs = new Date(item.endedAt).getTime() - new Date(item.startedAt).getTime();
  item.details = details;
}

function addFailure(message) {
  if (!report.failureAnalysis.includes(message)) report.failureAnalysis.push(message);
}

async function loadFixture() {
  try {
    const parsed = JSON.parse(await readFile(fixturePath, 'utf8'));
    const users = Array.isArray(parsed.users) ? parsed.users : [];
    const sku = parsed.sku ?? parsed.flashSaleSku ?? null;
    report.fixture.userCount = users.length;
    report.fixture.sku = sku
      ? {
          id:
            typeof sku.id === 'string' ? sku.id : typeof sku.skuId === 'string' ? sku.skuId : null,
          variantId: typeof sku.variantId === 'string' ? sku.variantId : null,
          campaignId:
            typeof sku.campaignId === 'string'
              ? sku.campaignId
              : typeof parsed.campaignId === 'string'
                ? parsed.campaignId
                : null,
          expectedQuota: Number.isFinite(Number(sku.expectedQuota))
            ? Number(sku.expectedQuota)
            : CONFIG.skuQuota,
        }
      : null;
    if (users.length < CONFIG.buyers)
      addFailure(
        `Fixture has ${users.length} users; ${CONFIG.buyers} authenticated buyers are required.`,
      );
    if (!sku?.id && !sku?.skuId && !sku?.variantId)
      addFailure('Fixture must identify one Flash Sale SKU by sku.id/skuId or variantId.');
    report.buyers = Array.from({ length: CONFIG.buyers }, (_, index) => users[index]).map(
      (user, index) => ({
        index,
        userId: typeof user?.id === 'string' ? user.id : null,
        ticketId: null,
        finalState: 'BLOCKED',
        waitTimeMs: null,
        joinedAt: null,
        admittedAt: null,
        admissionWave: null,
        relinquishedAt: null,
        outcome: 'BLOCKED',
        confirmation: null,
        events: [],
      }),
    );
    for (const [index, user] of users.slice(0, CONFIG.buyers).entries()) {
      if (!user?.accessToken || String(user.accessToken).startsWith('replace-'))
        addFailure(`Fixture buyer ${index + 1} has no real access token.`);
      if (!user?.id) addFailure(`Fixture buyer ${index + 1} has no stable user id.`);
      if (!user?.preview?.shippingAddressId)
        addFailure(`Fixture buyer ${index + 1} has no preview shippingAddressId.`);
    }
    return { parsed, users: users.slice(0, CONFIG.buyers) };
  } catch (error) {
    addFailure(
      `Fixture could not be read: ${error instanceof Error ? error.message : String(error)}`,
    );
    report.buyers = Array.from({ length: CONFIG.buyers }, (_, index) => ({
      index,
      userId: null,
      ticketId: null,
      finalState: 'BLOCKED',
      waitTimeMs: null,
      joinedAt: null,
      admittedAt: null,
      admissionWave: null,
      relinquishedAt: null,
      outcome: 'BLOCKED',
      confirmation: null,
      events: [],
    }));
    return { parsed: null, users: [] };
  }
}

async function probeHttp() {
  const started = nowMs();
  try {
    const response = await fetch(`${baseUrl}/health`, {
      signal: AbortSignal.timeout(CONFIG.requestTimeoutMs),
      headers: { Accept: 'application/json', Origin: origin },
    });
    const serviceReady = response.ok;
    return {
      available: serviceReady,
      reachable: true,
      status: response.status,
      latencyMs: nowMs() - started,
      detail: serviceReady
        ? 'Public API health endpoint responded successfully.'
        : `API responded with HTTP ${response.status}; service is not ready.`,
    };
  } catch (error) {
    return {
      available: false,
      reachable: false,
      status: null,
      latencyMs: nowMs() - started,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

async function probeRedis() {
  try {
    const { createClient } = await import('redis');
    const client = createClient({ url: redisUrl });
    await client.connect();
    const pong = await client.ping();
    await client.quit();
    return {
      available: pong === 'PONG',
      detail: pong === 'PONG' ? 'PING/PONG' : `unexpected response ${pong}`,
    };
  } catch (error) {
    return { available: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

async function probePostgres() {
  if (!databaseUrl) return { available: false, detail: 'DATABASE_URL is not set.' };
  let pool;
  try {
    const { Pool } = await import('pg');
    pool = new Pool({ connectionString: databaseUrl, max: 1 });
    await pool.query('SELECT 1');
    return { available: true, detail: 'SELECT 1' };
  } catch (error) {
    return { available: false, detail: error instanceof Error ? error.message : String(error) };
  } finally {
    await pool?.end().catch(() => undefined);
  }
}

async function probeLocalStack() {
  try {
    const response = await fetch(`${localstackUrl}/_localstack/health`, {
      signal: AbortSignal.timeout(2_000),
    });
    return {
      available: response.ok,
      status: response.status,
      detail: response.ok ? 'LocalStack health endpoint responded.' : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      available: false,
      status: null,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

async function preflight(fixture) {
  const item = phase(
    'preflight',
    'Check fixture and real API/Redis/PostgreSQL/LocalStack availability.',
  );
  const [api, redis, postgres, localstack] = await Promise.all([
    probeHttp(),
    probeRedis(),
    probePostgres(),
    probeLocalStack(),
  ]);
  report.prerequisites = {
    api: { required: true, ...api },
    redis: { required: true, ...redis },
    postgres: { required: true, ...postgres },
    localstack: {
      required:
        process.env.ADMISSION_SQS_ENABLED === 'true' ||
        process.env.ADMISSION_LAMBDA_ENABLED === 'true',
      ...localstack,
    },
    fixture: {
      required: true,
      available:
        report.failureAnalysis.filter((message) => message.toLowerCase().includes('fixture'))
          .length === 0,
      users: fixture.users.length,
    },
  };
  report.serviceDownMatrix = {
    api: {
      availability: api.available
        ? 'AVAILABLE'
        : api.reachable
          ? 'REACHABLE_NOT_READY'
          : 'UNAVAILABLE',
      correctness: 'NOT_RUN',
      recovery: 'NOT_RUN',
    },
    redis: {
      availability: redis.available ? 'AVAILABLE' : 'UNAVAILABLE',
      correctness: 'NOT_RUN',
      recovery: 'NOT_RUN',
    },
    postgres: {
      availability: postgres.available ? 'AVAILABLE' : 'UNAVAILABLE',
      correctness: 'NOT_RUN',
      recovery: 'NOT_RUN',
    },
    localstack: {
      availability: localstack.available ? 'AVAILABLE' : 'UNAVAILABLE',
      correctness: 'NOT_RUN',
      recovery: 'NOT_RUN',
    },
  };
  finishPhase(item, report.prerequisites);
  if (!api.available) addFailure('Real API is unavailable; no load traffic was sent.');
  if (!redis.available) addFailure('Redis is unavailable; no admission state can be verified.');
  if (!postgres.available)
    addFailure(
      'PostgreSQL is unavailable or DATABASE_URL is unset; SKU/order invariants cannot be verified.',
    );
  if (report.prerequisites.localstack.required && !localstack.available)
    addFailure('LocalStack is required by the API configuration but unavailable.');
  if (postgres.available && report.fixture.sku) {
    const [initialSnapshot, initialRedis] = await Promise.all([
      queryDatabaseSnapshot(report.fixture.sku, []),
      queryRedisSnapshot(report.fixture.sku),
    ]);
    report.preflightSnapshot = {
      capturedAt: iso(),
      postgres: initialSnapshot,
      redis: initialRedis,
    };
    report.prerequisites.sku = {
      required: true,
      available: initialSnapshot.available,
      detail: initialSnapshot.detail ?? 'Initial SKU snapshot captured.',
      remainingQuantity: initialSnapshot.sku?.remainingQuantity ?? null,
      expectedRemainingQuantity: CONFIG.skuQuota,
    };
    if (!initialSnapshot.available)
      addFailure('Initial Flash Sale SKU snapshot could not be read from PostgreSQL.');
    else if (initialSnapshot.sku.remainingQuantity !== CONFIG.skuQuota)
      addFailure(
        `Initial SKU remaining quantity is ${initialSnapshot.sku.remainingQuantity}; expected ${CONFIG.skuQuota}.`,
      );
    report.prerequisites.redisState = {
      required: true,
      available:
        initialRedis.available &&
        initialRedis.activeLeases === 0 &&
        initialRedis.pendingReleases === 0,
      detail: initialRedis.available
        ? `activeLeases=${initialRedis.activeLeases}, pendingReleases=${initialRedis.pendingReleases}`
        : initialRedis.detail,
    };
    if (
      !initialRedis.available ||
      initialRedis.activeLeases !== 0 ||
      initialRedis.pendingReleases !== 0
    ) {
      addFailure('POC Redis namespace is not clean before traffic; refusing contaminated results.');
    }
  }
  return report.prerequisites;
}

function cookieFromResponse(response) {
  const cookies =
    typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
  return (
    cookies
      .map((value) => value.split(';', 1)[0])
      .find((value) => value.startsWith('sc_admission=')) ?? null
  );
}

function responseBody(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 600) };
  }
}

async function apiRequest(worker, method, path, body, options = {}) {
  const started = nowMs();
  const headers = {
    Accept: 'application/json',
    Origin: worker.origin,
    Authorization: `Bearer ${worker.accessToken}`,
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
  if (options.ifMatch) headers['If-Match'] = options.ifMatch;
  if (worker.cookie) headers.Cookie = worker.cookie;
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(CONFIG.requestTimeoutMs),
    });
    const text = await response.text();
    const nextCookie = cookieFromResponse(response);
    if (nextCookie) worker.cookie = nextCookie;
    return {
      status: response.status,
      body: responseBody(text),
      latencyMs: nowMs() - started,
      retryAfter: response.headers.get('retry-after'),
      cookieSet: Boolean(nextCookie),
    };
  } catch (error) {
    return {
      status: null,
      body: null,
      latencyMs: nowMs() - started,
      retryAfter: null,
      cookieSet: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function recordEvent(worker, type, data = {}) {
  const event = { type, at: iso(), ...data };
  worker.events.push(event);
  return event;
}

function workerView(worker) {
  return {
    index: worker.index,
    userId: worker.userId,
    ticketId: worker.ticketId,
    finalState: worker.state,
    waitTimeMs: worker.admittedAt && worker.joinedAt ? worker.admittedAt - worker.joinedAt : null,
    admittedAt: worker.admittedAt ? iso(worker.admittedAt) : null,
    joinedAt: worker.joinedAt ? iso(worker.joinedAt) : null,
    admissionWave: worker.admissionWave,
    relinquishedAt: worker.relinquishedAt ? iso(worker.relinquishedAt) : null,
    outcome: worker.outcome,
    confirmation: worker.confirmation
      ? {
          phase: worker.confirmation.phase,
          status: worker.confirmation.status,
          latencyMs: worker.confirmation.latencyMs,
          code: worker.confirmation.code ?? null,
        }
      : null,
    events: worker.events,
  };
}

async function join(worker, runIdValue) {
  worker.joinedAt = nowMs();
  const idempotencyKey = `t35-${runIdValue}-${String(worker.index + 1).padStart(3, '0')}`
    .slice(0, 120)
    .padEnd(16, '0');
  const response = await apiRequest(worker, 'POST', '/admission/checkout/tickets', undefined, {
    idempotencyKey,
  });
  const state = response.body?.state;
  worker.ticketId = response.body?.ticketId ?? null;
  worker.state = state ?? 'ERROR';
  worker.outcome = state ?? 'JOIN_FAILED';
  recordEvent(worker, 'join', {
    status: safeStatus(response.status),
    state,
    latencyMs: response.latencyMs,
    cookieSet: response.cookieSet,
    error: response.error ?? null,
  });
  if (state === 'ADMITTED') {
    worker.admittedAt = nowMs();
    worker.admissionWave = 1;
  }
  return response;
}

async function status(worker, admissionWave = 0) {
  if (!worker.ticketId || worker.ticketId === 'bypass') return null;
  const response = await apiRequest(
    worker,
    'GET',
    `/admission/checkout/status?ticketId=${encodeURIComponent(worker.ticketId)}`,
  );
  const nextState = response.body?.state;
  if (nextState) {
    const previous = worker.state;
    worker.state = nextState;
    if (nextState === 'ADMITTED' && !worker.admittedAt) {
      worker.admittedAt = nowMs();
      worker.admissionWave = admissionWave;
    }
    if (previous !== nextState)
      recordEvent(worker, 'state', {
        from: previous,
        to: nextState,
        status: safeStatus(response.status),
        latencyMs: response.latencyMs,
      });
  } else {
    recordEvent(worker, 'status-error', {
      status: safeStatus(response.status),
      latencyMs: response.latencyMs,
      error: response.error ?? null,
    });
  }
  return response;
}

async function refreshStatuses(workers, admissionWave = 0) {
  const candidates = workers.filter(
    (worker) => worker.ticketId && (worker.state === 'WAITING' || worker.state === 'ADMITTED'),
  );
  await Promise.all(candidates.map((worker) => status(worker, admissionWave)));
}

function selectAdmitted(workers, count, excluded = new Set()) {
  return workers
    .filter(
      (worker) =>
        worker.state === 'ADMITTED' &&
        !excluded.has(worker.index) &&
        !worker.confirmation &&
        !worker.relinquishedAt,
    )
    .sort(
      (left, right) =>
        (left.admittedAt ?? Number.MAX_SAFE_INTEGER) -
        (right.admittedAt ?? Number.MAX_SAFE_INTEGER),
    )
    .slice(0, count);
}

function selectLatestAdmitted(workers, count, excluded = new Set()) {
  return workers
    .filter(
      (worker) =>
        worker.state === 'ADMITTED' &&
        !excluded.has(worker.index) &&
        !worker.confirmation &&
        !worker.relinquishedAt,
    )
    .sort((left, right) => (right.admittedAt ?? 0) - (left.admittedAt ?? 0))
    .slice(0, count);
}

function selectActiveLeases(workers, excluded = new Set()) {
  return workers.filter(
    (worker) =>
      worker.state === 'ADMITTED' &&
      !excluded.has(worker.index) &&
      !worker.relinquishedAt,
  );
}

async function relinquish(worker, mode = 'EXPLICIT') {
  if (!worker.ticketId || !worker.cookie) {
    recordEvent(worker, 'relinquish-skipped', {
      reason: !worker.ticketId ? 'missing-ticket' : 'missing-cookie',
    });
    return null;
  }
  const browserInstanceId = randomUUID();
  const response = await apiRequest(worker, 'POST', '/admission/checkout/relinquish', {
    ticketId: worker.ticketId,
    browserInstanceId,
    mode,
  });
  if (response.status === 204) {
    worker.relinquishedAt = nowMs();
    worker.state = mode === 'EXPLICIT' ? 'CLOSED' : worker.state;
    worker.outcome = mode === 'EXPLICIT' ? 'RELINQUISHED' : 'PAGE_LEAVE_PENDING';
  } else {
    worker.outcome = 'RELINQUISH_FAILED';
    addFailure(
      `Buyer ${worker.index + 1} relinquish returned HTTP ${response.status ?? 'network-error'}.`,
    );
  }
  recordEvent(worker, 'relinquish', {
    mode,
    status: safeStatus(response.status),
    latencyMs: response.latencyMs,
    error: response.error ?? null,
  });
  return response;
}

async function preview(worker) {
  const ifMatch = worker.user.cartEtag ?? `"cart-${worker.user.cartVersion ?? 0}"`;
  const response = await apiRequest(worker, 'POST', '/checkout/preview', worker.user.preview, {
    ifMatch,
  });
  recordEvent(worker, 'preview', {
    status: safeStatus(response.status),
    latencyMs: response.latencyMs,
    error: response.error ?? null,
  });
  return response;
}

async function confirm(worker, previewResponse, phaseName) {
  const body = previewResponse?.body;
  if (!body?.checkoutFingerprint) {
    worker.confirmation = {
      phase: phaseName,
      status: null,
      latencyMs: null,
      code: 'MISSING_CHECKOUT_FINGERPRINT',
    };
    worker.outcome = 'CONFIRMATION_BLOCKED';
    recordEvent(worker, 'confirm-skipped', {
      phase: phaseName,
      reason: 'missing-checkout-fingerprint',
    });
    return null;
  }
  const input = {
    ...(worker.user.confirmation ?? worker.user.preview ?? {}),
    checkoutFingerprint: body.checkoutFingerprint,
  };
  worker.orderIdempotencyKey ??= randomUUID();
  const ifMatch = worker.user.cartEtag ?? `"cart-${worker.user.cartVersion ?? 0}"`;
  const response = await apiRequest(worker, 'POST', '/checkout/cod', input, {
    ifMatch,
    idempotencyKey: worker.orderIdempotencyKey,
  });
  const code =
    typeof response.body?.code === 'string'
      ? response.body.code
      : typeof response.body?.type === 'string'
        ? response.body.type.split('/').at(-1)?.toUpperCase().replaceAll('-', '_') ?? null
        : null;
  worker.confirmation = {
    phase: phaseName,
    status: safeStatus(response.status),
    latencyMs: response.latencyMs,
    code,
  };
  worker.outcome =
    response.status === 201 || response.status === 200
      ? 'ORDER_CREATED'
      : code === 'FLASH_SALE_SOLD_OUT'
        ? 'SOLD_OUT'
        : response.status === 429
          ? 'BUSY'
          : response.status === null
            ? 'REQUEST_FAILED'
            : 'CONFIRMATION_REJECTED';
  recordEvent(worker, 'confirm', {
    phase: phaseName,
    status: safeStatus(response.status),
    latencyMs: response.latencyMs,
    code,
    error: response.error ?? null,
  });
  if (response.status === 201 || response.status === 200) worker.state = 'CLOSED';
  return response;
}

async function queryDatabaseSnapshot(sku, userIds = []) {
  if (!databaseUrl || (!sku?.id && !sku?.variantId))
    return { available: false, detail: 'DB snapshot requires DATABASE_URL and SKU id/variantId.' };
  let pool;
  try {
    const { Pool } = await import('pg');
    pool = new Pool({ connectionString: databaseUrl, max: 2 });
    const where = sku.id ? 'id = $1::uuid' : 'variant_id = $1::uuid';
    const value = sku.id ?? sku.variantId;
    const row =
      (
        await pool.query(
          `SELECT id, campaign_id, variant_id, allocated_quantity, remaining_quantity, net_consumed_quantity, version FROM flash_sale_skus WHERE ${where} ORDER BY updated_at DESC LIMIT 1`,
          [value],
        )
      ).rows[0] ?? null;
    if (!row) return { available: false, detail: 'No matching flash_sale_skus row found.' };
    const globalClaims = (
      await pool.query(
        'SELECT COUNT(*)::int AS count FROM flash_sale_buyer_claims WHERE flash_sale_sku_id = $1::uuid',
        [row.id],
      )
    ).rows[0]?.count;
    const globalConsumptions = (
      await pool.query(
        'SELECT COUNT(*)::int AS count FROM flash_sale_consumptions WHERE flash_sale_sku_id = $1::uuid AND reversed_at IS NULL',
        [row.id],
      )
    ).rows[0]?.count;
    const globalOrders = (
      await pool.query(
        'SELECT COUNT(DISTINCT p.id)::int AS count FROM purchases p JOIN shop_orders so ON so.purchase_id = p.id JOIN order_lines ol ON ol.order_id = so.id JOIN flash_sale_consumptions c ON c.order_line_id = ol.id WHERE c.flash_sale_sku_id = $1::uuid',
        [row.id],
      )
    ).rows[0]?.count;
    const runClaims = userIds.length
      ? ((
          await pool.query(
            'SELECT COUNT(*)::int AS count FROM flash_sale_buyer_claims WHERE flash_sale_sku_id = $1::uuid AND buyer_id = ANY($2::uuid[])',
            [row.id, userIds],
          )
        ).rows[0]?.count ?? null)
      : null;
    const runConsumptions = userIds.length
      ? ((
          await pool.query(
            'SELECT COUNT(*)::int AS count FROM flash_sale_consumptions c JOIN order_lines ol ON ol.id = c.order_line_id JOIN shop_orders so ON so.id = ol.order_id JOIN purchases p ON p.id = so.purchase_id WHERE c.flash_sale_sku_id = $1::uuid AND c.reversed_at IS NULL AND p.buyer_id = ANY($2::uuid[])',
            [row.id, userIds],
          )
        ).rows[0]?.count ?? null)
      : null;
    const runOrders = userIds.length
      ? ((
          await pool.query(
            'SELECT COUNT(DISTINCT p.id)::int AS count FROM purchases p JOIN shop_orders so ON so.purchase_id = p.id JOIN order_lines ol ON ol.order_id = so.id JOIN flash_sale_consumptions c ON c.order_line_id = ol.id WHERE c.flash_sale_sku_id = $1::uuid AND p.buyer_id = ANY($2::uuid[])',
            [row.id, userIds],
          )
        ).rows[0]?.count ?? null)
      : null;
    return {
      available: true,
      sku: {
        id: row.id,
        campaignId: row.campaign_id,
        variantId: row.variant_id,
        allocatedQuantity: Number(row.allocated_quantity),
        remainingQuantity: Number(row.remaining_quantity),
        netConsumedQuantity: Number(row.net_consumed_quantity),
        version: Number(row.version),
      },
      globalClaims: globalClaims === null || globalClaims === undefined ? null : Number(globalClaims),
      globalActiveConsumptions:
        globalConsumptions === null || globalConsumptions === undefined
          ? null
          : Number(globalConsumptions),
      globalOrders: globalOrders === null || globalOrders === undefined ? null : Number(globalOrders),
      runClaims: runClaims === null || runClaims === undefined ? null : Number(runClaims),
      runActiveConsumptions:
        runConsumptions === null || runConsumptions === undefined
          ? null
          : Number(runConsumptions),
      runOrders: runOrders === null || runOrders === undefined ? null : Number(runOrders),
    };
  } catch (error) {
    return { available: false, detail: error instanceof Error ? error.message : String(error) };
  } finally {
    await pool?.end().catch(() => undefined);
  }
}

async function queryRedisSnapshot(sku) {
  try {
    const { createClient } = await import('redis');
    const client = createClient({ url: redisUrl });
    await client.connect();
    const admittedKey = 'admission:checkout:admitted';
    const pendingKey = 'admission:checkout:pending-releases';
    const slotKey = 'flash-sale:admission:global-slots-v5';
    const values = await Promise.all([
      client.zCard(admittedKey),
      client.zCard(pendingKey),
      client.get(slotKey),
      sku?.id ? client.get(`flash-sale:admission:sku:${sku.id}`) : null,
    ]);
    await client.quit();
    return {
      available: true,
      activeLeases: Number(values[0] ?? 0),
      pendingReleases: Number(values[1] ?? 0),
      confirmationSlotsAvailable: values[2] === null ? null : Number(values[2]),
      skuRemainingAdmission:
        values[3] === null || values[3] === undefined ? null : Number(values[3]),
    };
  } catch (error) {
    return { available: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

function updatePeaks(snapshot) {
  if (!snapshot?.available) return;
  if (Number.isFinite(snapshot.activeLeases))
    report.observed.peakActiveLeases = Math.max(
      report.observed.peakActiveLeases ?? 0,
      snapshot.activeLeases,
    );
  if (Number.isFinite(snapshot.pendingReleases))
    report.observed.peakPendingReleases = Math.max(
      report.observed.peakPendingReleases ?? 0,
      snapshot.pendingReleases,
    );
  if (Number.isFinite(snapshot.confirmationSlotsAvailable)) {
    report.observed.minimumConfirmationSlotsAvailable = Math.min(
      report.observed.minimumConfirmationSlotsAvailable ?? CONFIG.confirmationConcurrency,
      snapshot.confirmationSlotsAvailable,
    );
    report.observed.peakExecutingConfirmations = Math.max(
      report.observed.peakExecutingConfirmations ?? 0,
      CONFIG.confirmationConcurrency - snapshot.confirmationSlotsAvailable,
    );
  }
}

async function captureSnapshot(sku, userIds = []) {
  const [postgres, redis] = await Promise.all([
    queryDatabaseSnapshot(sku, userIds),
    queryRedisSnapshot(sku),
  ]);
  updatePeaks(redis);
  return { capturedAt: iso(), postgres, redis };
}

async function waitForAdmitted(workers, targetCount, timeoutMs, admissionWave = 0) {
  const started = nowMs();
  while (nowMs() - started < timeoutMs) {
    await refreshStatuses(workers, admissionWave);
    const admitted = workers.filter((worker) => worker.state === 'ADMITTED');
    if (admitted.length >= targetCount) return admitted;
    await sleep(CONFIG.pollIntervalMs);
  }
  await refreshStatuses(workers, admissionWave);
  return workers.filter((worker) => worker.state === 'ADMITTED');
}

async function waitForEverAdmitted(workers, targetCount, timeoutMs, admissionWave) {
  const started = nowMs();
  while (nowMs() - started < timeoutMs) {
    await refreshStatuses(workers, admissionWave);
    const everAdmitted = workers.filter((worker) => worker.admittedAt !== null);
    if (everAdmitted.length >= targetCount) return everAdmitted;
    await sleep(CONFIG.pollIntervalMs);
  }
  await refreshStatuses(workers, admissionWave);
  return workers.filter((worker) => worker.admittedAt !== null);
}

async function runConfirmationAttempt(workers, phaseName, attempt) {
  const previews = await Promise.all(
    workers.map(async (worker) => {
      if (worker.confirmationPreview) return worker.confirmationPreview;
      worker.confirmationPreview = await preview(worker);
      return worker.confirmationPreview;
    }),
  );
  let confirmationsSettled = false;
  const slotSamples = [];
  const confirmations = Promise.all(
    workers.map((worker, index) => confirm(worker, previews[index], phaseName)),
  ).finally(() => {
    confirmationsSettled = true;
  });
  while (!confirmationsSettled) {
    const snapshot = await queryRedisSnapshot(report.fixture.sku);
    updatePeaks(snapshot);
    slotSamples.push({ at: iso(), available: snapshot.confirmationSlotsAvailable ?? null });
    if (!confirmationsSettled) await sleep(50);
  }
  const results = await confirmations;
  return {
    attempt,
    buyers: workers.map((worker) => worker.index + 1),
    results,
    slotSamples,
  };
}

async function runConfirmationWave(workers, phaseName, targetSuccessful) {
  const item = phase(
    phaseName,
    `Preview and confirm ${workers.length} buyers concurrently; retry only explicit 429 busy responses with the same order key.`,
  );
  let pending = [...workers];
  let successful = 0;
  let busy = 0;
  let conflict = 0;
  let soldOut = 0;
  const attempts = [];
  for (
    let attempt = 1;
    attempt <= CONFIG.confirmationRetryLimit && pending.length && successful < targetSuccessful;
    attempt += 1
  ) {
    const measured = await runConfirmationAttempt(pending, phaseName, attempt);
    const attemptSuccessful = measured.results.filter(
      (response) => response?.status === 201 || response?.status === 200,
    ).length;
    const attemptBusy = measured.results.filter((response) => response?.status === 429).length;
    const attemptConflict = measured.results.filter((response) => response?.status === 409).length;
    const attemptSoldOut = measured.results.filter(
      (response) => response?.body?.code === 'FLASH_SALE_SOLD_OUT',
    ).length;
    successful += attemptSuccessful;
    busy += attemptBusy;
    conflict += attemptConflict;
    soldOut += attemptSoldOut;
    attempts.push({
      attempt,
      buyers: measured.buyers,
      successful: attemptSuccessful,
      busy: attemptBusy,
      conflict: attemptConflict,
      soldOut: attemptSoldOut,
      responses: measured.results.map((response) => ({
        status: response?.status ?? null,
        type: response?.body?.type ?? null,
        code: response?.body?.code ?? null,
        detail: response?.body?.detail ?? response?.error ?? null,
      })),
      slotSamples: measured.slotSamples,
    });
    pending = pending.filter((_, index) => measured.results[index]?.status === 429);
    if (pending.length && successful < targetSuccessful)
      await sleep(CONFIG.confirmationRetryDelayMs);
  }
  if (phaseName === 'seed-confirmation') report.observed.seedSuccessfulOrders += successful;
  if (phaseName === 'final-confirmation') {
    report.observed.finalSuccessfulOrders += successful;
    report.observed.finalBusyResponses += busy;
    report.observed.finalConflictResponses += conflict;
    report.observed.finalUnsuccessfulBuyers += workers.filter(
      (worker) => worker.outcome !== 'ORDER_CREATED',
    ).length;
    report.observed.finalSoldOutResponses += soldOut;
  }
  finishPhase(item, {
    buyers: workers.length,
    targetSuccessful,
    successful,
    busy,
    conflict,
    soldOut,
    attempts,
  });
  return { successful, busy, conflict, soldOut, attempts };
}

async function runScenario(fixture) {
  const workers = fixture.users.slice(0, CONFIG.buyers).map((user, index) => ({
    index,
    user,
    userId: user.id,
    accessToken: user.accessToken,
    origin: user.origin ?? origin,
    cookie: null,
    ticketId: null,
    state: 'NOT_STARTED',
    joinedAt: null,
    admittedAt: null,
    relinquishedAt: null,
    confirmation: null,
    confirmationPreview: null,
    orderIdempotencyKey: null,
    admissionWave: null,
    outcome: 'NOT_STARTED',
    events: [],
  }));
  const joinPhase = phase(
    'join-100',
    'Join 100 authenticated buyers concurrently with distinct admission idempotency keys.',
  );
  const joins = await Promise.all(workers.map((worker) => join(worker, runId)));
  finishPhase(joinPhase, {
    buyers: workers.length,
    http200: joins.filter((response) => response?.status === 200).length,
    admitted: workers.filter((worker) => worker.state === 'ADMITTED').length,
    waiting: workers.filter((worker) => worker.state === 'WAITING').length,
    errors: joins.filter((response) => response?.status !== 200).length,
  });
  if (workers.some((worker) => worker.ticketId === 'bypass'))
    addFailure(
      'Admission was bypassed for at least one buyer; fixture/API was not classified as a Flash Sale cart.',
    );

  const initialAdmitted = await waitForAdmitted(
    workers,
    Math.min(CONFIG.admissionPool, CONFIG.buyers),
    CONFIG.admissionWaitTimeoutMs,
    1,
  );
  const runUserIds = workers.map((worker) => worker.userId).filter(Boolean);
  const firstSnapshot = await captureSnapshot(report.fixture.sku, runUserIds);
  report.initialSnapshot = firstSnapshot;
  report.phases.push({
    name: 'initial-admission-snapshot',
    description: 'Observe initial admission pool after the 100 concurrent joins.',
    startedAt: firstSnapshot.capturedAt,
    endedAt: firstSnapshot.capturedAt,
    durationMs: 0,
    details: firstSnapshot,
  });
  if (initialAdmitted.length < CONFIG.admissionPool)
    addFailure(
      `Initial admitted count was ${initialAdmitted.length}; expected pool capacity ${CONFIG.admissionPool}.`,
    );

  const released = new Set();
  const seedCount = CONFIG.skuQuota - CONFIG.finalRemainingQuota;
  const seedTargets = selectAdmitted(workers, seedCount, released);
  if (seedTargets.length !== seedCount)
    addFailure(`Seed phase selected ${seedTargets.length} buyers; expected ${seedCount}.`);
  if (seedTargets.length)
    await runConfirmationWave(seedTargets, 'seed-confirmation', seedCount);
  await waitForEverAdmitted(
    workers,
    CONFIG.admissionPool + report.observed.seedSuccessfulOrders,
    CONFIG.admissionWaitTimeoutMs,
    2,
  );

  for (let wave = 1; wave <= CONFIG.relinquishWaves; wave += 1) {
    await sleep(CONFIG.relinquishIntervalMs);
    const grantWave = wave + 2;
    await refreshStatuses(workers, grantWave - 1);
    const targets = selectAdmitted(workers, CONFIG.relinquishBatch, released);
    const item = phase(
      `relinquish-wave-${wave}`,
      `Explicitly relinquish ${CONFIG.relinquishBatch} admitted buyers at t=${wave * CONFIG.relinquishIntervalMs}ms.`,
    );
    await Promise.all(targets.map((worker) => relinquish(worker, 'EXPLICIT')));
    targets.forEach((worker) => released.add(worker.index));
    report.observed.relinquishedBuyers += targets.length;
    const expectedEverAdmitted = Math.min(
      CONFIG.buyers,
      CONFIG.admissionPool +
        report.observed.seedSuccessfulOrders +
        wave * CONFIG.relinquishBatch,
    );
    const everAdmitted = await waitForEverAdmitted(
      workers,
      expectedEverAdmitted,
      CONFIG.admissionWaitTimeoutMs,
      grantWave,
    );
    const snapshot = await captureSnapshot(report.fixture.sku);
    finishPhase(item, {
      targets: targets.map((worker) => worker.index),
      relinquished: targets.length,
      everAdmitted: everAdmitted.length,
      expectedEverAdmitted,
      snapshot,
    });
    if (targets.length !== CONFIG.relinquishBatch)
      addFailure(
        `Relinquish wave ${wave} selected ${targets.length} buyers instead of ${CONFIG.relinquishBatch}.`,
      );
  }

  await waitForEverAdmitted(
    workers,
    CONFIG.buyers,
    CONFIG.admissionWaitTimeoutMs,
    CONFIG.relinquishWaves + 2,
  );
  const finalTargets = selectLatestAdmitted(workers, CONFIG.finalWaveBuyers, released);
  if (finalTargets.length !== CONFIG.finalWaveBuyers)
    addFailure(
      `Final wave selected ${finalTargets.length} admitted buyers; expected ${CONFIG.finalWaveBuyers}.`,
    );
  if (finalTargets.length)
    await runConfirmationWave(
      finalTargets,
      'final-confirmation',
      CONFIG.finalRemainingQuota,
    );

  const cleanupPhase = phase(
    'cleanup-leases',
    'Release any leases left by the POC so the local admission pool is not polluted.',
  );
  let cleanupRounds = 0;
  while (cleanupRounds < 3) {
    cleanupRounds += 1;
    await refreshStatuses(workers, CONFIG.relinquishWaves + 2);
    const cleanupTargets = selectActiveLeases(workers, released);
    if (!cleanupTargets.length) break;
    await Promise.all(cleanupTargets.map((worker) => relinquish(worker, 'EXPLICIT')));
    report.observed.cleanupReleasedLeases += cleanupTargets.length;
    await sleep(100);
  }
  finishPhase(cleanupPhase, {
    rounds: cleanupRounds,
    released: report.observed.cleanupReleasedLeases,
  });

  const finalSnapshot = await captureSnapshot(report.fixture.sku, runUserIds);
  report.finalSnapshot = finalSnapshot;
  const successfulOrders =
    report.observed.seedSuccessfulOrders + report.observed.finalSuccessfulOrders;
  report.observed.duplicateOrders = Number.isFinite(finalSnapshot.postgres?.runOrders)
    ? Math.max(0, finalSnapshot.postgres.runOrders - successfulOrders)
    : null;
  report.buyers = workers.map(workerView);
}

function evaluateInvariants(initialSnapshot) {
  const initialSku = initialSnapshot?.postgres?.sku;
  const finalSku = report.finalSnapshot?.postgres?.sku;
  const final = report.finalSnapshot;
  const add = (name, pass, observed, expected, detail) =>
    report.finalInvariants.push({ name, pass, observed, expected, detail });
  add(
    'all 100 buyers joined',
    report.phases.find((item) => item.name === 'join-100')?.details?.buyers === CONFIG.buyers,
    report.phases.find((item) => item.name === 'join-100')?.details?.buyers ?? null,
    CONFIG.buyers,
    'The runner sends all joins concurrently.',
  );
  const ticketIds = report.buyers.map((buyer) => buyer.ticketId).filter(Boolean);
  add(
    'all buyers have unique tickets',
    ticketIds.length === CONFIG.buyers && new Set(ticketIds).size === CONFIG.buyers,
    { present: ticketIds.length, unique: new Set(ticketIds).size },
    { present: CONFIG.buyers, unique: CONFIG.buyers },
    'Distinct join keys and Redis buyer/gate deduplication must not collapse distinct buyers.',
  );
  add(
    'admission pool reaches configured 40',
    (report.observed.peakActiveLeases ?? 0) === CONFIG.admissionPool,
    report.observed.peakActiveLeases,
    CONFIG.admissionPool,
    'A lower value usually means the API was not started with the requested pool configuration.',
  );
  add(
    'relinquishment waves release 60 buyers',
    report.observed.relinquishedBuyers === CONFIG.relinquishWaves * CONFIG.relinquishBatch,
    report.observed.relinquishedBuyers,
    CONFIG.relinquishWaves * CONFIG.relinquishBatch,
    'Explicit relinquishment is immediate and idempotent.',
  );
  add(
    'all 100 buyers eventually receive admission',
    report.buyers.filter((buyer) => buyer.admittedAt !== null).length === CONFIG.buyers,
    report.buyers.filter((buyer) => buyer.admittedAt !== null).length,
    CONFIG.buyers,
    'A released lease must be granted to a waiting buyer without waiting for a new checkout request.',
  );
  add(
    'cleanup leaves no active admission lease',
    report.finalSnapshot?.redis?.activeLeases === 0,
    report.finalSnapshot?.redis?.activeLeases ?? null,
    0,
    'The harness cleans up remaining leases after the final wave.',
  );
  const expectedCleanup =
    CONFIG.buyers -
    report.observed.relinquishedBuyers -
    report.observed.seedSuccessfulOrders -
    report.observed.finalSuccessfulOrders;
  add(
    'cleanup releases every non-purchasing active lease',
    report.observed.cleanupReleasedLeases === expectedCleanup,
    report.observed.cleanupReleasedLeases,
    expectedCleanup,
    'Every admitted buyer ends through purchase, explicit wave release, or harness cleanup.',
  );
  add(
    'seed phase creates 5 successful orders',
    report.observed.seedSuccessfulOrders === CONFIG.skuQuota - CONFIG.finalRemainingQuota,
    report.observed.seedSuccessfulOrders,
    CONFIG.skuQuota - CONFIG.finalRemainingQuota,
    'The seed phase leaves exactly five quota units for the final contention wave.',
  );
  add(
    'final wave has 5 successful orders',
    report.observed.finalSuccessfulOrders === CONFIG.finalRemainingQuota,
    report.observed.finalSuccessfulOrders,
    CONFIG.finalRemainingQuota,
    'Requires a SKU with five quota units remaining before the final wave.',
  );
  add(
    'final contention leaves exactly 5 buyers without an order',
    report.observed.finalUnsuccessfulBuyers ===
      CONFIG.finalWaveBuyers - CONFIG.finalRemainingQuota,
    report.observed.finalUnsuccessfulBuyers,
    CONFIG.finalWaveBuyers - CONFIG.finalRemainingQuota,
    'Busy responses may retry; terminal conflicts remain non-purchasing contenders.',
  );
  add(
    'final contention observes bounded backpressure',
    report.observed.finalBusyResponses > 0,
    report.observed.finalBusyResponses,
    '>0',
    'At least one concurrent request receives 429 and retries with the same order key.',
  );
  add(
    'confirmation execution peak reaches exactly 5',
    report.observed.peakExecutingConfirmations === CONFIG.confirmationConcurrency,
    report.observed.peakExecutingConfirmations,
    CONFIG.confirmationConcurrency,
    'Redis slot sampling runs while the concurrent confirmations are in flight.',
  );
  if (initialSku && finalSku) {
    const expectedFinal =
      initialSku.remainingQuantity -
      report.observed.seedSuccessfulOrders -
      report.observed.finalSuccessfulOrders;
    add(
      'database remaining quota matches successful orders',
      finalSku.remainingQuantity === expectedFinal,
      finalSku.remainingQuantity,
      expectedFinal,
      'No external buyer or seller mutation may occur during the run.',
    );
    add(
      'database quota is nonnegative and bounded',
      finalSku.remainingQuantity >= 0 && finalSku.remainingQuantity <= finalSku.allocatedQuantity,
      finalSku.remainingQuantity,
      `0..${finalSku.allocatedQuantity}`,
      'DB invariant.',
    );
    add(
      'database net consumption matches active consumption',
      finalSku.netConsumedQuantity - initialSku.netConsumedQuantity ===
        final.postgres.runActiveConsumptions,
      finalSku.netConsumedQuantity - initialSku.netConsumedQuantity,
      final.postgres.runActiveConsumptions,
      'Global DB consumption delta equals non-reversed consumption created by this run.',
    );
    add(
      'run-scoped orders match successful confirmations',
      final.postgres.runOrders ===
        report.observed.seedSuccessfulOrders + report.observed.finalSuccessfulOrders,
      final.postgres.runOrders,
      report.observed.seedSuccessfulOrders + report.observed.finalSuccessfulOrders,
      'Counts only orders belonging to the 100 fixture buyers.',
    );
    add(
      'no duplicate orders are created',
      report.observed.duplicateOrders === 0,
      report.observed.duplicateOrders,
      0,
      'Run-scoped durable orders equal successful API confirmations.',
    );
  } else {
    add(
      'database final invariants available',
      false,
      null,
      'PostgreSQL snapshot',
      'Cannot claim quota/order invariants without a real PostgreSQL snapshot.',
    );
  }
  const failed = report.finalInvariants.filter((item) => item.pass === false);
  if (failed.length)
    failed.forEach((item) =>
      addFailure(
        `${item.name}: observed ${JSON.stringify(item.observed)}, expected ${JSON.stringify(item.expected)}.`,
      ),
    );
}

function compactPhaseDetails(details) {
  return JSON.stringify(details, (key, value) => {
    if (key !== 'slotSamples' || !Array.isArray(value)) return value;
    const available = value
      .map((sample) => sample?.available)
      .filter((slot) => Number.isFinite(slot));
    return {
      count: value.length,
      minAvailable: available.length ? Math.min(...available) : null,
      maxAvailable: available.length ? Math.max(...available) : null,
    };
  });
}

function waitTimeByWave() {
  const waves = new Map();
  for (const buyer of report.buyers) {
    if (!Number.isFinite(buyer.admissionWave) || !Number.isFinite(buyer.waitTimeMs)) continue;
    const values = waves.get(buyer.admissionWave) ?? [];
    values.push(buyer.waitTimeMs);
    waves.set(buyer.admissionWave, values);
  }
  return [...waves.entries()]
    .sort(([left], [right]) => left - right)
    .map(([wave, values]) => {
      const ordered = [...values].sort((left, right) => left - right);
      return {
        wave,
        buyers: ordered.length,
        minMs: ordered[0] ?? null,
        medianMs: ordered[Math.floor(ordered.length / 2)] ?? null,
        maxMs: ordered.at(-1) ?? null,
      };
    });
}

function markdown() {
  const lines = [
    '# T35 admission relinquishment POC',
    '',
    `- Run: \`${report.runId}\``,
    `- Status: **${report.status}**`,
    `- Started: ${report.startedAt}`,
    `- Finished: ${report.finishedAt ?? 'not finished'}`,
    '',
    '## Scenario',
    '',
    `100 authenticated buyers join concurrently; one SKU starts at quota ${CONFIG.skuQuota}; admission pool target is ${CONFIG.admissionPool}; ${CONFIG.relinquishWaves} waves release ${CONFIG.relinquishBatch} admitted buyers every ${CONFIG.relinquishIntervalMs / 1000}s; ${CONFIG.finalWaveBuyers} final buyers compete for ${CONFIG.finalRemainingQuota} remaining units with confirmation concurrency target ${CONFIG.confirmationConcurrency}.`,
    '',
    'The final contenders are the ten most recently admitted live buyers (they may span the last two grant observations). PostgreSQL reconciliation uses this run\'s 100 buyer IDs; historical global claims/orders in the test database are shown only as baseline context.',
    '',
    '## Dependency status',
    '',
    '| Dependency | Required | Available | Detail |',
    '| --- | ---: | ---: | --- |',
    ...Object.entries(report.prerequisites).map(
      ([name, item]) =>
        `| ${name} | ${item.required ? 'yes' : 'optional'} | ${item.available ? 'yes' : 'no'} | ${String(item.detail ?? '').replaceAll('|', '\\|')} |`,
    ),
    '',
    '## Service-down matrix',
    '',
    '| Service | Availability | Correctness | Recovery |',
    '| --- | --- | --- | --- |',
    ...Object.entries(report.serviceDownMatrix).map(
      ([name, item]) =>
        `| ${name} | ${item.availability} | ${item.correctness} | ${item.recovery} |`,
    ),
    '',
    '## Architecture fault-tolerance assessment',
    '',
    '> This section is an architecture analysis, not a fault-injection measurement.',
    '',
    '| Service down | Availability impact | Safety behavior | Recovery path |',
    '| --- | --- | --- | --- |',
    ...report.architectureFailureAssessment.map(
      (item) =>
        `| ${item.service} | ${item.impact.replaceAll('|', '\\|')} | ${item.safety.replaceAll('|', '\\|')} | ${item.recovery.replaceAll('|', '\\|')} |`,
    ),
    '',
    '## Phase summary',
    '',
    '| Phase | Duration ms | Details |',
    '| --- | ---: | --- |',
    ...report.phases.map(
      (item) =>
        `| ${item.name} | ${item.durationMs ?? ''} | ${compactPhaseDetails(item.details).replaceAll('|', '\\|')} |`,
    ),
    '',
    '## Wait time by admission wave',
    '',
    '| Admission wave | Buyers | Min ms | Median ms | Max ms |',
    '| ---: | ---: | ---: | ---: | ---: |',
    ...waitTimeByWave().map(
      (item) =>
        `| ${item.wave} | ${item.buyers} | ${item.minMs} | ${item.medianMs} | ${item.maxMs} |`,
    ),
    '',
    '## Observed totals',
    '',
    '```json',
    JSON.stringify(report.observed, null, 2),
    '```',
    '',
    '## Final invariants',
    '',
    '| Invariant | Result | Observed | Expected |',
    '| --- | --- | --- | --- |',
    ...report.finalInvariants.map(
      (item) =>
        `| ${item.name} | ${item.pass ? 'PASS' : 'FAIL'} | ${JSON.stringify(item.observed)} | ${JSON.stringify(item.expected)} |`,
    ),
    '',
    '## Failure analysis / limitations',
    '',
    ...(report.failureAnalysis.length
      ? report.failureAnalysis.map((item) => `- ${item}`)
      : ['- None recorded.']),
    '',
    'Detailed per-buyer events are in `result.json`; the wait-time CSV contains one row for every configured buyer. The runner never writes access tokens or admission cookies to either artifact.',
  ];
  return `${lines.join('\n')}\n`;
}

function waitCsv() {
  const escape = (value) => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const rows = [
    [
      'buyerIndex',
      'userId',
      'joinedAt',
      'admittedAt',
      'waitMs',
      'admissionWave',
      'outcome',
      'relinquishedAt',
      'confirmationStatus',
    ],
    ...report.buyers.map((buyer) => [
      buyer.index + 1,
      buyer.userId,
      buyer.joinedAt,
      buyer.admittedAt,
      buyer.waitTimeMs,
      buyer.admissionWave,
      buyer.outcome ?? buyer.finalState,
      buyer.relinquishedAt,
      buyer.confirmation?.status ?? null,
    ]),
  ];
  return `${rows.map((row) => row.map(escape).join(',')).join('\n')}\n`;
}

async function writeArtifacts() {
  report.finishedAt = iso();
  await mkdir(resultDir, { recursive: true });
  const jsonPath = resolve(resultDir, 'result.json');
  const markdownPath = resolve(resultDir, 'summary.md');
  const csvPath = resolve(resultDir, 'buyer-wait-times.csv');
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(markdownPath, markdown(), 'utf8');
  await writeFile(csvPath, waitCsv(), 'utf8');
  console.log(
    JSON.stringify(
      { status: report.status, jsonPath, markdownPath, csvPath, runId: report.runId },
      null,
      2,
    ),
  );
}

async function main() {
  const fixture = await loadFixture();
  await preflight(fixture);
  const apiReady = report.prerequisites.api?.available;
  const dataReady =
    report.prerequisites.redis?.available && report.prerequisites.postgres?.available;
  const fixtureReady =
    report.failureAnalysis.filter((message) => message.toLowerCase().includes('fixture')).length ===
    0;
  if (!runRequested) {
    addFailure(
      'Dry-run only. Pass --run after reviewing preflight and using a local fixture with 100 real buyers.',
    );
  } else if (!apiReady || !dataReady || !fixtureReady) {
    addFailure(
      'Run blocked before traffic because required dependencies or fixture data are unavailable.',
    );
  } else {
    report.status = 'RUNNING';
    await runScenario(fixture);
    evaluateInvariants(report.initialSnapshot);
    report.status =
      report.failureAnalysis.length || report.finalInvariants.some((item) => !item.pass)
        ? 'FAIL'
        : 'PASS';
  }
  if (report.status === 'NOT_RUN' && runRequested) report.status = 'BLOCKED';
  if (report.status === 'RUNNING') report.status = 'FAIL';
  await writeArtifacts();
}

main().catch(async (error) => {
  report.status = 'BLOCKED';
  addFailure(
    `Unhandled harness error: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
  );
  await writeArtifacts();
  process.exitCode = 1;
});
