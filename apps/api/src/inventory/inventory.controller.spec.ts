import { InventoryController } from './inventory.controller';
import { InventoryValidationError } from './inventory.errors';
import type { Response } from 'express';

const user = { id: '00000000-0000-4000-8000-000000000001' };
const variantId = '00000000-0000-4000-8000-000000000002';
const key = '00000000-0000-4000-8000-000000000003';

describe('InventoryController', () => {
  function fixture() {
    const inventory = {
      list: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
      history: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
      adjust: jest.fn().mockResolvedValue({ inventoryVersion: 8, id: 'audit' }),
    };
    return { controller: new InventoryController(inventory as never), inventory };
  }

  it('validates and forwards seller list/history queries', async () => {
    const { controller, inventory } = fixture();
    const req = { authUser: user } as never;
    await controller.list(req, { limit: '20' });
    await controller.history(req, variantId, { limit: '20' });
    expect(inventory.list).toHaveBeenCalledWith(user.id, { cursor: null, limit: 20, productId: null, lowStock: null });
    expect(inventory.history).toHaveBeenCalledWith(user.id, variantId, { cursor: null, limit: 20, productId: null, lowStock: null });
    await expect(controller.list({ authUser: null } as never, { limit: '20' })).rejects.toBeInstanceOf(InventoryValidationError);
  });

  it('requires ETag/idempotency headers and returns the next ETag on success', async () => {
    const { controller, inventory } = fixture();
    const response = { setHeader: jest.fn() } as unknown as Response;
    const req = { authUser: user } as never;
    await expect(controller.adjust(req, variantId, undefined, key, { delta: 1, reason: 'RESTOCK', note: null }, response)).rejects.toBeInstanceOf(InventoryValidationError);
    await expect(controller.adjust(req, variantId, '"inventory-7"', key, { delta: 1, reason: 'RESTOCK', note: null }, response)).resolves.toMatchObject({ id: 'audit' });
    expect(inventory.adjust).toHaveBeenCalledWith(user.id, variantId, 7, key, { delta: 1, reason: 'RESTOCK', note: null });
    expect(response.setHeader).toHaveBeenCalledWith('ETag', '"inventory-8"');
  });
});
