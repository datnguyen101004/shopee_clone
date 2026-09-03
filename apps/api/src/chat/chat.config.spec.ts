import { loadChatConfig } from './chat.config';

describe('chat runtime configuration', () => {
  const names = [
    'CHAT_TICKET_TTL_SECONDS',
    'CHAT_PRESENCE_LEASE_SECONDS',
    'CHAT_OUTBOX_BATCH',
    'CHAT_MESSAGE_RATE_PER_MINUTE',
    'CHAT_OUTBOX_READINESS_MAX_AGE_SECONDS',
  ] as const;
  const original = new Map(names.map((name) => [name, process.env[name]]));

  afterEach(() => {
    for (const name of names) {
      const value = original.get(name);
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it('exposes only runtime limits and keeps chat available by default', () => {
    const config = loadChatConfig();
    expect(config).toEqual({
      ticketTtlSeconds: 60,
      presenceLeaseSeconds: 45,
      outboxBatch: 50,
      messageRatePerMinute: 30,
      outboxReadinessMaxAgeSeconds: 60,
    });
    expect('enabled' in config).toBe(false);
  });

  it('validates bounded operational limits', () => {
    process.env.CHAT_TICKET_TTL_SECONDS = '120';
    process.env.CHAT_PRESENCE_LEASE_SECONDS = '30';
    process.env.CHAT_OUTBOX_BATCH = '10';
    process.env.CHAT_MESSAGE_RATE_PER_MINUTE = '20';
    expect(loadChatConfig()).toEqual({
      ticketTtlSeconds: 120,
      presenceLeaseSeconds: 30,
      outboxBatch: 10,
      messageRatePerMinute: 20,
      outboxReadinessMaxAgeSeconds: 60,
    });
    process.env.CHAT_OUTBOX_BATCH = '0';
    expect(() => loadChatConfig()).toThrow('CHAT_OUTBOX_BATCH');
  });
});
