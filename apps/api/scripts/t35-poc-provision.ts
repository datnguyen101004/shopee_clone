import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { createPrismaClient } from '../prisma/create-prisma-client';

const baseUrl = (process.env.T35_POC_BASE_URL ?? 'http://127.0.0.1:3001/api/v1').replace(/\/$/, '');
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
const count = Math.max(1, Number(process.env.T35_POC_BUYERS ?? 21));
const runId = (process.env.T35_POC_RUN_ID ?? randomUUID()).replace(/[^a-zA-Z0-9-]/g, '').slice(0, 24);
const emailPrefix = `t35-poc-${runId}`;
const password = process.env.T35_POC_PASSWORD ?? 'T35Poc-local-password-2026!';
const output = process.env.T35_POC_FIXTURE ?? 'scripts/poc/t35/fixtures.local.json';
const campaignId = process.env.T35_POC_CAMPAIGN_ID ?? '00000000-0000-4000-8000-000000000914';
const mode = process.env.T35_POC_MODE === 'ordinary' ? 'ordinary' : 'flash';
const prisma = createPrismaClient(databaseUrl);

type Session = { accessToken: string; user: { id: string } };

async function register(index: number): Promise<Session> {
  const response = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
    body: JSON.stringify({ displayName: `T35 POC ${runId}-${index}`, email: `${emailPrefix}-${index}@poc.shopee-clone.local`, password }),
  });
  if (!response.ok) throw new Error(`register ${index} failed: ${response.status} ${await response.text()}`);
  return (await response.json()) as Session;
}

async function main(): Promise<void> {
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
        where: { campaignId, endedAt: null, remainingQuantity: { gt: 0 } },
        orderBy: { id: 'asc' },
        select: { variantId: true, productId: true, salePriceMinor: true, product: { select: { shopId: true } } },
      });
  if (!sku) throw new Error(mode === 'ordinary' ? 'No ordinary sellable variant was found' : 'No active seeded Flash Sale SKU with remaining quota was found');
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

  await writeFile(output, `${JSON.stringify({ baseUrl, controlPlaneUrl: baseUrl, runId, emailPrefix, mode, campaignId: mode === 'ordinary' ? null : campaignId, sku: { variantId, productId: sku.productId, salePriceMinor: unitPriceMinor.toString(), product: sku.product }, users: fixtureUsers, public: mode === 'ordinary' ? { campaignId: '', variantIds: [] } : { campaignId, variantIds: [variantId] } }, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ runId, emailPrefix, mode, count: fixtureUsers.length, campaignId: mode === 'ordinary' ? null : campaignId, variantId, output }, null, 2));
}

void main().finally(async () => {
  await prisma.$disconnect();
});
