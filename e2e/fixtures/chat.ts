import { test as base } from '@playwright/test';

export const chatFixtureIds = {
  buyer: '00000000-0000-4000-8000-000000009001',
  seller: '00000000-0000-4000-8000-000000009002',
  outsider: '00000000-0000-4000-8000-000000009005',
  shop: '00000000-0000-4000-8000-000000009006',
} as const;

export const chatTest = base.extend<{
  chatAccounts: { buyer: typeof chatFixtureIds.buyer; seller: typeof chatFixtureIds.seller; outsider: typeof chatFixtureIds.outsider };
  singleOwnerShop: { id: typeof chatFixtureIds.shop; ownerId: typeof chatFixtureIds.seller };
}>({
  chatAccounts: async ({}, use) => use({ buyer: chatFixtureIds.buyer, seller: chatFixtureIds.seller, outsider: chatFixtureIds.outsider }),
  singleOwnerShop: async ({}, use) => use({ id: chatFixtureIds.shop, ownerId: chatFixtureIds.seller }),
});
