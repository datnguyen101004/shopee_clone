import { CartService } from './cart.service';

describe('cart clickstream outcome projection', () => {
  it('emits only affected lines with committed action, quantity, and selection', async () => {
    const clickstream = { captureAuthoritativeOutcome: jest.fn().mockResolvedValue(null) };
    const service = new CartService({} as never, clickstream as never);
    await (
      service as unknown as {
        captureCartOutcome(userId: string, outcomes: unknown[]): Promise<void>;
      }
    ).captureCartOutcome('buyer-1', [
      { productId: '11111111-1111-4111-8111-111111111111', action: 'remove', quantity: 0 },
      {
        productId: '22222222-2222-4222-8222-222222222222',
        action: 'select',
        selected: false,
      },
    ]);
    expect(clickstream.captureAuthoritativeOutcome).toHaveBeenCalledTimes(2);
    expect(clickstream.captureAuthoritativeOutcome).toHaveBeenNthCalledWith(1, {
      eventType: 'cart_changed',
      surface: 'cart',
      userId: 'buyer-1',
      productId: '11111111-1111-4111-8111-111111111111',
      properties: { action: 'remove', quantity: 0 },
    });
    expect(clickstream.captureAuthoritativeOutcome).toHaveBeenNthCalledWith(2, {
      eventType: 'cart_changed',
      surface: 'cart',
      userId: 'buyer-1',
      productId: '22222222-2222-4222-8222-222222222222',
      properties: { action: 'select', selected: false },
    });
  });

  it('does not emit unchanged selections', async () => {
    const clickstream = { captureAuthoritativeOutcome: jest.fn() };
    const service = new CartService({} as never, clickstream as never);
    await (
      service as unknown as {
        captureCartOutcome(userId: string, outcomes: unknown[]): Promise<void>;
      }
    ).captureCartOutcome('buyer-1', []);
    expect(clickstream.captureAuthoritativeOutcome).not.toHaveBeenCalled();
  });

  it('emits add only for a committed add outcome and keeps quantity updates out of Add to Cart', async () => {
    const clickstream = { captureAuthoritativeOutcome: jest.fn().mockResolvedValue(null) };
    const service = new CartService({} as never, clickstream as never);
    await (service as unknown as { captureCartOutcome(userId: string, outcomes: unknown[]): Promise<void> })
      .captureCartOutcome('buyer-1', [
        { productId: '11111111-1111-4111-8111-111111111111', action: 'add', quantity: 2 },
        { productId: '22222222-2222-4222-8222-222222222222', action: 'update', quantity: 3 },
      ]);
    expect(clickstream.captureAuthoritativeOutcome).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'cart_changed', properties: { action: 'add', quantity: 2 } }));
    expect(clickstream.captureAuthoritativeOutcome).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'cart_changed', properties: { action: 'update', quantity: 3 } }));
  });
});
