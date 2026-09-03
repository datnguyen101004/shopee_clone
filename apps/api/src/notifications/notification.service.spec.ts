import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  const prisma = {
    notification: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    notificationDeliveryAttempt: {
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
  };

  const repository = {};
  const preferences = {
    isChannelEnabled: jest.fn().mockResolvedValue(true),
  };
  const emailTransporter = { send: jest.fn() };

  let service: NotificationService;

  beforeEach(() => {
    jest.clearAllMocks();
    preferences.isChannelEnabled.mockResolvedValue(true);
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) =>
      fn(prisma),
    );
    service = new NotificationService(
      prisma as never,
      repository as never,
      preferences as never,
      emailTransporter,
    );
  });

  it('skips creating a duplicate notification for the same dedupe key', async () => {
    prisma.notification.findUnique.mockResolvedValue({ id: 'existing' });
    const result = await service.notify({
      type: 'ORDER_DELIVERED',
      referenceKey: 'order:1',
      recipients: [
        {
          userId: 'buyer',
          roleTag: 'buyer',
          title: 'Delivered',
          body: 'Done',
          metadata: {
            targetUrl: '/account/orders/1',
            thumbnailUrl: null,
            referenceId: '1',
            amountMinor: 1000,
            currency: 'VND',
          },
        },
      ],
    });
    expect(result).toEqual({ created: 0, skipped: 1 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('creates in-app notification and queues email attempt', async () => {
    prisma.notification.findUnique.mockResolvedValue(null);
    prisma.notification.create.mockResolvedValue({ id: 'n1' });
    prisma.notificationDeliveryAttempt.create.mockResolvedValue({ id: 'a1' });
    const result = await service.notify({
      type: 'ORDER_CONFIRMED',
      referenceKey: 'order:2',
      recipients: [
        {
          userId: 'buyer',
          roleTag: 'buyer',
          title: 'Confirmed',
          body: 'OK',
          metadata: {
            targetUrl: '/account/orders/2',
            thumbnailUrl: null,
            referenceId: '2',
            amountMinor: null,
            currency: null,
          },
        },
      ],
    });
    expect(result.created).toBe(1);
    expect(prisma.notification.create).toHaveBeenCalled();
    expect(prisma.notificationDeliveryAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ channel: 'EMAIL', status: 'PENDING' }),
      }),
    );
  });

  it('claims outbox rows with SKIP LOCKED and schedules exponential retry on failure', async () => {
    const claimRows = [{ id: 'attempt-1', notification_id: 'n1', attempt_count: 1 }];
    prisma.$queryRaw.mockResolvedValue(claimRows);
    prisma.notificationDeliveryAttempt.update.mockResolvedValue({});
    prisma.notification.findUnique.mockResolvedValue({
      id: 'n1',
      title: 'Hi',
      body: 'Body',
      type: 'ORDER_DELIVERED',
      metadata: {
        targetUrl: '/account/orders/1',
        thumbnailUrl: null,
        referenceId: '1',
        amountMinor: null,
        currency: null,
      },
      recipient: { email: 'a@example.test', displayName: 'A' },
    });
    emailTransporter.send.mockRejectedValue(new Error('smtp timeout'));

    const processed = await service.processOutbox(10);
    expect(processed).toBe(1);
    expect(prisma.notificationDeliveryAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'attempt-1' },
        data: expect.objectContaining({
          status: 'FAILED',
          attemptCount: 2,
          lastError: 'smtp timeout',
        }),
      }),
    );
    const failedUpdate = prisma.notificationDeliveryAttempt.update.mock.calls.find(
      (call) => call[0]?.data?.status === 'FAILED',
    );
    expect(failedUpdate?.[0]?.data?.nextRetryAt).toBeInstanceOf(Date);
  });
});
