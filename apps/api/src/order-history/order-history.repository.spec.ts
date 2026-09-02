import {
  OrderHistoryRepository,
  requiresConfirmedPaymentOrCod,
  statusesFor,
} from './order-history.repository';

describe('buyer shipping order filter', () => {
  it('groups awaiting pickup and shipping without changing domain statuses', () => {
    expect(statusesFor('SHIPPING')).toEqual(['AWAITING_PICKUP', 'SHIPPING']);
    expect(statusesFor('PENDING_CONFIRMATION')).toEqual(['PENDING_CONFIRMATION']);
  });

  it('filters pending online payments without including COD orders', () => {
    expect(statusesFor('PENDING_PAYMENT')).toEqual(['PENDING_PAYMENT']);
    expect(statusesFor('CANCELLED')).toEqual(['CANCELLED']);
  });

  it('requires a COD purchase or a paid online purchase in pending confirmation', () => {
    expect(requiresConfirmedPaymentOrCod('PENDING_CONFIRMATION')).toBe(true);
    expect(requiresConfirmedPaymentOrCod('PENDING_PAYMENT')).toBe(false);
    expect(requiresConfirmedPaymentOrCod('ALL')).toBe(false);
  });

  it('passes the grouped status predicate to the repository query', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const repository = new OrderHistoryRepository({ shopOrder: { findMany } } as never);
    await repository.list(
      '00000000-0000-4000-8000-000000000001',
      {
        filter: 'SHIPPING',
        limit: 20,
        cursor: null,
      },
      null,
    );
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { in: ['AWAITING_PICKUP', 'SHIPPING'] } }),
      }),
    );
  });

  it('passes the canonical pending-payment status predicate to the repository query', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const repository = new OrderHistoryRepository({ shopOrder: { findMany } } as never);
    await repository.list(
      '00000000-0000-4000-8000-000000000001',
      {
        filter: 'PENDING_PAYMENT',
        limit: 20,
        cursor: null,
      },
      null,
    );
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ['PENDING_PAYMENT'] },
        }),
      }),
    );
  });

  it('passes the confirmed-payment-or-COD gate to the pending-confirmation query', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const repository = new OrderHistoryRepository({ shopOrder: { findMany } } as never);
    await repository.list(
      '00000000-0000-4000-8000-000000000001',
      {
        filter: 'PENDING_CONFIRMATION',
        limit: 20,
        cursor: null,
      },
      null,
    );
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ['PENDING_CONFIRMATION'] },
          purchase: expect.objectContaining({
            OR: [{ paymentMethod: 'COD' }, { paymentStatus: 'PAID' }],
          }),
        }),
      }),
    );
  });

  it('passes the canonical cancelled status predicate without replacing cursor ownership', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const repository = new OrderHistoryRepository({ shopOrder: { findMany } } as never);
    const cursor = {
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
      id: '00000000-0000-4000-8000-000000000099',
    };
    await repository.list(
      '00000000-0000-4000-8000-000000000001',
      {
        filter: 'CANCELLED',
        limit: 20,
        cursor: 'opaque-cursor',
      },
      cursor,
    );
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          purchase: expect.objectContaining({
            buyerId: '00000000-0000-4000-8000-000000000001',
          }),
          status: { in: ['CANCELLED'] },
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        }),
      }),
    );
  });

  it('roots buyer pagination at individual ShopOrders', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const repository = new OrderHistoryRepository({ shopOrder: { findMany } } as never);
    await repository.list(
      '00000000-0000-4000-8000-000000000001',
      { filter: 'SHIPPING', limit: 20, cursor: null },
      null,
    );
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          purchase: expect.objectContaining({
            buyerId: '00000000-0000-4000-8000-000000000001',
          }),
          status: { in: ['AWAITING_PICKUP', 'SHIPPING'] },
        }),
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 21,
      }),
    );
  });

  it('keeps the payment gate and ShopOrder cursor together when paging pending confirmation', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const repository = new OrderHistoryRepository({ shopOrder: { findMany } } as never);
    const cursor = {
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
      id: '00000000-0000-4000-8000-000000000099',
    };

    await repository.list(
      '00000000-0000-4000-8000-000000000001',
      { filter: 'PENDING_CONFIRMATION', limit: 20, cursor: 'opaque-cursor' },
      cursor,
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          purchase: expect.objectContaining({
            buyerId: '00000000-0000-4000-8000-000000000001',
            OR: [{ paymentMethod: 'COD' }, { paymentStatus: 'PAID' }],
          }),
          status: { in: ['PENDING_CONFIRMATION'] },
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        }),
      }),
    );
  });

  it('resolves an owned ShopOrder reference directly', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const repository = new OrderHistoryRepository({ shopOrder: { findFirst } } as never);
    await repository.detail(
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000099',
    );
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: '00000000-0000-4000-8000-000000000099',
          purchase: { buyerId: '00000000-0000-4000-8000-000000000001' },
        },
      }),
    );
  });
});
