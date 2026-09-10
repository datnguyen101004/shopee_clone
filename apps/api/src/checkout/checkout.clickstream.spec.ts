import { CheckoutService } from './checkout.service';

describe('checkout clickstream outcome', () => {
  it('projects only a committed order id and item count', async () => {
    const clickstream = { captureAuthoritativeOutcome: jest.fn().mockResolvedValue(null) };
    const service = new CheckoutService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      clickstream as never,
    );
    await (
      service as unknown as {
        captureOrderOutcome(userId: string, purchase: unknown): Promise<void>;
      }
    ).captureOrderOutcome('buyer-1', {
      purchaseReference: '11111111-1111-4111-8111-111111111111',
      orders: [{ lines: [{ quantity: 2 }, { quantity: 1 }] }],
    });
    expect(clickstream.captureAuthoritativeOutcome).toHaveBeenCalledWith({
      eventType: 'order_completed',
      surface: 'checkout',
      userId: 'buyer-1',
      properties: {
        orderId: '11111111-1111-4111-8111-111111111111',
        itemCount: 3,
      },
    });
    expect(JSON.stringify(clickstream.captureAuthoritativeOutcome.mock.calls[0])).not.toContain(
      'amount',
    );
  });

  it('swallows an analytics failure after checkout commit', async () => {
    const clickstream = {
      captureAuthoritativeOutcome: jest.fn().mockRejectedValue(new Error('offline')),
    };
    const service = new CheckoutService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      clickstream as never,
    );
    await expect(
      (
        service as unknown as {
          captureOrderOutcome(userId: string, purchase: unknown): Promise<void>;
        }
      ).captureOrderOutcome('buyer-1', {
        purchaseReference: '11111111-1111-4111-8111-111111111111',
        orders: [{ lines: [{ quantity: 1 }] }],
      }),
    ).resolves.toBeUndefined();
  });
});
