import { NotificationPreferenceForbiddenError } from './notification.errors';
import { NotificationPreferenceService } from './notification-preference.service';

describe('NotificationPreferenceService', () => {
  const prisma = {
    notificationPreference: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  };

  let service: NotificationPreferenceService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new NotificationPreferenceService(prisma as never);
  });

  it('lists defaults as enabled with ORDERS marked mandatory', async () => {
    prisma.notificationPreference.findMany.mockResolvedValue([]);
    const result = await service.list('user-1');
    expect(result.notificationVersion).toBe('notifications-v1');
    expect(result.preferences).toHaveLength(10);
    expect(
      result.preferences.find((item) => item.category === 'CHAT' && item.channel === 'IN_APP'),
    ).toMatchObject({ enabled: true, mandatory: false });
    expect(
      result.preferences.find((item) => item.category === 'ORDERS' && item.channel === 'EMAIL'),
    ).toMatchObject({ enabled: true, mandatory: true });
    expect(
      result.preferences.find(
        (item) => item.category === 'PROMOTIONS' && item.channel === 'EMAIL',
      ),
    ).toMatchObject({ enabled: true, mandatory: false });
  });

  it('rejects disabling mandatory ORDERS channels', async () => {
    await expect(
      service.update('user-1', { category: 'ORDERS', channel: 'EMAIL', enabled: false }),
    ).rejects.toBeInstanceOf(NotificationPreferenceForbiddenError);
  });

  it('allows disabling promotional email and forces mandatory types on', async () => {
    prisma.notificationPreference.upsert.mockResolvedValue({});
    prisma.notificationPreference.findMany.mockResolvedValue([
      { category: 'PROMOTIONS', channel: 'EMAIL', enabled: false },
    ]);
    const updated = await service.update('user-1', {
      category: 'PROMOTIONS',
      channel: 'EMAIL',
      enabled: false,
    });
    expect(
      updated.preferences.find(
        (item) => item.category === 'PROMOTIONS' && item.channel === 'EMAIL',
      )?.enabled,
    ).toBe(false);

    await expect(
      service.isChannelEnabled('user-1', 'ORDERS', 'EMAIL', 'REFUNDED'),
    ).resolves.toBe(true);
    prisma.notificationPreference.findUnique.mockResolvedValue({ enabled: false });
    await expect(
      service.isChannelEnabled('user-1', 'PROMOTIONS', 'EMAIL', 'VOUCHER_ASSIGNED'),
    ).resolves.toBe(false);
  });
});
