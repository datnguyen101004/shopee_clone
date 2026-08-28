import { orderNotificationEvent } from './notification-events';

describe('orderNotificationEvent', () => {
  const order = {
    orderId: '1e7a962b-800f-4625-b2f5-84211039ec28',
    buyerId: '6f648f16-8d9a-4ad9-a959-7c14a7c210ed',
    sellerOwnerId: '75b92ba1-7d94-46a1-a567-2c173299fd48',
    amountMinor: 125_000,
  };

  it('notifies only the shop owner when checkout creates an order', () => {
    const event = orderNotificationEvent({ type: 'ORDER_CREATED', ...order });

    expect(event.type).toBe('ORDER_CREATED');
    expect(event.recipients).toHaveLength(1);
    expect(event.recipients[0]).toMatchObject({
      userId: order.sellerOwnerId,
      roleTag: 'seller',
      title: 'Có đơn hàng mới',
      metadata: {
        targetUrl: `/seller/orders/${order.orderId}`,
        referenceId: order.orderId,
      },
    });
  });

  it('keeps shipping lifecycle notifications for buyer and shop', () => {
    const event = orderNotificationEvent({ type: 'ORDER_SHIPPING', ...order });

    expect(event.recipients.map(({ roleTag }) => roleTag)).toEqual(['buyer', 'seller']);
    expect(event.recipients[0]?.body).toContain('đã lấy đơn');
    expect(event.recipients[1]?.title).toBe('Đơn vị vận chuyển đã lấy hàng');
  });
});
