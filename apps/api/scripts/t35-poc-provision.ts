import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { JwtService } from '@nestjs/jwt';
import { MarketplaceRole, RoleAuditAction, RoleAuditSource, UserStatus } from '../src/generated/prisma/enums';
import { createPrismaClient } from '../prisma/create-prisma-client';

const baseUrl = (process.env.T35_POC_BASE_URL ?? 'http://127.0.0.1:3001/api/v1').replace(/\/$/, '');
const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
const count = Math.max(1, Number(process.env.T35_POC_BUYERS ?? 21));
const runId = (process.env.T35_POC_RUN_ID ?? randomUUID()).replace(/[^a-zA-Z0-9-]/g, '').slice(0, 40);
const emailPrefix = `t35-poc-${runId}`;
const password = process.env.T35_POC_PASSWORD ?? 'T35Poc-local-password-2026!';
const output = process.env.T35_POC_FIXTURE ?? 'scripts/poc/t35/fixtures.local.json';
const campaignId = process.env.T35_POC_CAMPAIGN_ID ?? '00000000-0000-4000-8000-000000000914';
const mode = process.env.T35_POC_MODE === 'ordinary' ? 'ordinary' : 'flash';
const expectedRemaining = mode === 'flash'
  ? Math.max(1, Number(process.env.T35_POC_EXPECTED_REMAINING ?? 10))
  : undefined;
const resetSkuQuota = process.env.T35_POC_RESET_SKU_QUOTA === 'true';
const directAuth = process.env.T35_POC_DIRECT_AUTH === 'true';
const reissueFixtureAuth = process.env.T35_POC_REISSUE_FIXTURE_AUTH === 'true';
const prisma = createPrismaClient(databaseUrl);
const jwt = new JwtService();
const authAccessSecret = process.env.AUTH_ACCESS_TOKEN_SECRET ??
  'development-only-auth-secret-never-use-outside-local-tests-2026';
const authIssuer = process.env.AUTH_TOKEN_ISSUER?.trim() || 'shopee-clone-api';
const authAudience = process.env.AUTH_TOKEN_AUDIENCE?.trim() || 'shopee-clone-web';
const authAccessTtlSeconds = Math.max(60, Number(process.env.AUTH_ACCESS_TTL_SECONDS ?? 900));
const authRefreshTtlSeconds = Math.max(3_600, Number(process.env.AUTH_REFRESH_TTL_SECONDS ?? 2_592_000));

type Session = { accessToken: string; user: { id: string } };

function issueAccessToken(userId: string, sessionId: string, now: Date): string {
  const issuedAt = Math.floor(now.getTime() / 1_000);
  return jwt.sign(
    { sid: sessionId, iat: issuedAt },
    {
      secret: authAccessSecret,
      algorithm: 'HS256',
      issuer: authIssuer,
      audience: authAudience,
      subject: userId,
      expiresIn: authAccessTtlSeconds,
    },
  );
}

function assertTestDatabase(): void {
  const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.split('/').at(-1) ?? '');
  if (!databaseName.endsWith('_test')) {
    throw new Error(
      `T35_POC_RESET_SKU_QUOTA is restricted to a *_test database; received ${databaseName || 'unknown'}`,
    );
  }
}

async function normalizeFlashSaleQuota(): Promise<void> {
  if (mode !== 'flash' || !resetSkuQuota || expectedRemaining === undefined) return;
  assertTestDatabase();
  const candidate = await prisma.flashSaleSku.findFirst({
    where: { campaignId, endedAt: null },
    orderBy: { id: 'asc' },
    select: {
      id: true,
      remainingQuantity: true,
      netConsumedQuantity: true,
      variant: {
        select: {
          inventory: { select: { quantityOnHand: true, quantityReserved: true } },
        },
      },
      _count: { select: { claims: true, consumptions: true } },
    },
  });
  if (!candidate) throw new Error(`No active seeded Flash Sale SKU was found in ${campaignId}`);
  if (
    candidate.netConsumedQuantity !== 0 ||
    candidate._count.claims !== 0 ||
    candidate._count.consumptions !== 0
  ) {
    throw new Error(
      `Refusing to reset SKU ${candidate.id}: the test fixture already has claims or consumptions`,
    );
  }
  const inventory = candidate.variant.inventory;
  const available = (inventory?.quantityOnHand ?? 0) - (inventory?.quantityReserved ?? 0);
  if (available < expectedRemaining) {
    throw new Error(
      `Refusing to reset SKU ${candidate.id}: physical availability ${available} is below quota ${expectedRemaining}`,
    );
  }
  if (candidate.remainingQuantity === expectedRemaining) return;
  await prisma.flashSaleSku.update({
    where: { id: candidate.id },
    data: {
      allocatedQuantity: expectedRemaining,
      remainingQuantity: expectedRemaining,
      version: { increment: 1 },
      managementEpoch: { increment: 1 },
    },
  });
}

async function register(index: number): Promise<Session> {
  if (directAuth) {
    assertTestDatabase();
    const now = new Date();
    const userId = randomUUID();
    const sessionId = randomUUID();
    const familyId = randomUUID();
    const expiresAt = new Date(now.getTime() + authRefreshTtlSeconds * 1_000);
    await prisma.$transaction(async (transaction) => {
      await transaction.user.create({
        data: {
          id: userId,
          email: `${emailPrefix}-${index}@poc.shopee-clone.local`,
          displayName: `T35 POC ${runId}-${index}`,
          status: UserStatus.ACTIVE,
        },
      });
      await transaction.userRoleAssignment.create({
        data: { userId, role: MarketplaceRole.BUYER, source: RoleAuditSource.SYSTEM },
      });
      await transaction.roleAuditEvent.create({
        data: {
          targetUserId: userId,
          role: MarketplaceRole.BUYER,
          action: RoleAuditAction.GRANT,
          source: RoleAuditSource.SYSTEM,
          reason: 'T35 local POC buyer role',
        },
      });
      await transaction.authSession.create({
        data: {
          id: sessionId,
          userId,
          familyId,
          tokenHash: randomBytes(32).toString('hex'),
          expiresAt,
          createdAt: now,
          lastUsedAt: now,
        },
      });
    });
    return { accessToken: issueAccessToken(userId, sessionId, now), user: { id: userId } };
  }
  const response = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
    body: JSON.stringify({ displayName: `T35 POC ${runId}-${index}`, email: `${emailPrefix}-${index}@poc.shopee-clone.local`, password }),
  });
  if (!response.ok) throw new Error(`register ${index} failed: ${response.status} ${await response.text()}`);
  return (await response.json()) as Session;
}

async function main(): Promise<void> {
  const outputPath = resolve(output);
  if (reissueFixtureAuth) {
    assertTestDatabase();
    const fixture = JSON.parse(await readFile(outputPath, 'utf8')) as {
      users?: Array<{ id?: string; accessToken?: string }>;
    };
    const users = fixture.users ?? [];
    const now = new Date();
    for (const user of users) {
      if (!user.id) throw new Error('Fixture user id is required for token reissue');
      const session = await prisma.authSession.findFirst({
        where: { userId: user.id, revokedAt: null, expiresAt: { gt: now } },
        orderBy: { lastUsedAt: 'desc' },
        select: { id: true },
      });
      if (!session) throw new Error(`No active auth session found for fixture user ${user.id}`);
      user.accessToken = issueAccessToken(user.id, session.id, now);
    }
    await writeFile(outputPath, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({ reissuedUsers: users.length, output }, null, 2));
    return;
  }
  await normalizeFlashSaleQuota();
  const sku = mode === 'ordinary'
    ? await prisma.productVariant.findFirst({
        where: {
          status: 'ACTIVE',
          deletedAt: null,
          product: {
            status: 'ACTIVE',
            moderationStatus: 'ACTIVE',
            deletedAt: null,
            flashSaleSkus: {
              none: {
                endedAt: null,
                campaign: { cancelledAt: null, startsAt: { lte: new Date() }, endsAt: { gt: new Date() } },
              },
            },
          },
        },
        orderBy: { id: 'asc' },
        select: { id: true, productId: true, priceMinor: true, product: { select: { shopId: true } } },
      })
    : await prisma.flashSaleSku.findFirst({
        where: {
          campaignId,
          endedAt: null,
          remainingQuantity: expectedRemaining === undefined ? { gt: 0 } : expectedRemaining,
        },
        orderBy: { id: 'asc' },
        select: { id: true, variantId: true, productId: true, salePriceMinor: true, product: { select: { shopId: true } } },
      });
  if (!sku) throw new Error(mode === 'ordinary' ? 'No ordinary sellable variant was found' : `No active seeded Flash Sale SKU with remaining quota=${expectedRemaining} was found`);
  const variantId = mode === 'ordinary' ? sku.id : sku.variantId;
  const unitPriceMinor = mode === 'ordinary' ? sku.priceMinor : sku.salePriceMinor;

  const sessions: Session[] = [];
  for (let index = 0; index < count; index += 1) sessions.push(await register(index));
  const fixtureUsers = [];
  for (let index = 0; index < sessions.length; index += 1) {
    const session = sessions[index]!;
    const addressId = randomUUID();
    const cartId = randomUUID();
    await prisma.$transaction(async (transaction) => {
      await transaction.shippingAddress.create({ data: { id: addressId, userId: session.user.id, recipientName: `T35 POC ${index}`, phoneNumber: `090${String(index).padStart(7, '0')}`, province: 'TP. Hồ Chí Minh', district: 'Quận 1', ward: 'Phường Bến Nghé', addressLine: `${index + 1} Nguyễn Huệ`, label: 'T35 POC', isDefault: true } });
      await transaction.cart.create({ data: { id: cartId, userId: session.user.id, version: 0 } });
      await transaction.cartLine.create({ data: { id: randomUUID(), cartId, variantId, quantity: 1, isSelected: true, lastObservedUnitPriceMinor: unitPriceMinor } });
    });
    fixtureUsers.push({ origin: 'http://localhost:3000', id: session.user.id, accessToken: session.accessToken, cartVersion: 0, cartEtag: '"cart-0"', preview: { shippingAddressId: addressId, services: [{ shopId: sku.product.shopId, service: 'STANDARD' }] } });
  }

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify({ baseUrl, controlPlaneUrl: baseUrl, runId, emailPrefix, mode, campaignId: mode === 'ordinary' ? null : campaignId, sku: { id: mode === 'ordinary' ? null : sku.id, campaignId: mode === 'ordinary' ? null : campaignId, variantId, productId: sku.productId, expectedQuota: expectedRemaining, salePriceMinor: unitPriceMinor.toString(), product: sku.product }, users: fixtureUsers, public: mode === 'ordinary' ? { campaignId: '', variantIds: [] } : { campaignId, variantIds: [variantId] } }, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ runId, emailPrefix, mode, count: fixtureUsers.length, campaignId: mode === 'ordinary' ? null : campaignId, expectedRemaining, variantId, output }, null, 2));
}

void main().finally(async () => {
  await prisma.$disconnect();
});
