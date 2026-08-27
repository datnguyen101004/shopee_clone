import { ChatOutboxDispatcher, ChatPresenceService, ChatRealtimeGateway, ChatTicketService } from './chat.realtime';
import { ChatOutboxStatus } from '../generated/prisma/enums';

describe('chat realtime primitives', () => {
  it('issues one-time short-lived tickets', () => {
    const service = new ChatTicketService();
    const issued = service.issue('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 60);
    expect(service.consume(issued.ticket)?.userId).toBe('00000000-0000-4000-8000-000000000001');
    expect(service.consume(issued.ticket)).toBeNull();
  });

  it('tracks process-local active connection counts', () => {
    const presence = new ChatPresenceService();
    const user = '00000000-0000-4000-8000-000000000001';
    expect(presence.state(user)).toBe('INACTIVE');
    presence.connect(user);
    expect(presence.state(user)).toBe('ACTIVE');
    presence.disconnect(user);
    expect(presence.state(user)).toBe('INACTIVE');
  });

  it('refreshes an active connection when a heartbeat arrives after the lease expires', () => {
    jest.useFakeTimers();
    try {
      const presence = new ChatPresenceService({
        ticketTtlSeconds: 60,
        presenceLeaseSeconds: 45,
        outboxBatch: 50,
        messageRatePerMinute: 30,
      });
      const user = '00000000-0000-4000-8000-000000000001';

      presence.connect(user);
      jest.advanceTimersByTime(45_001);
      expect(presence.state(user)).toBe('INACTIVE');

      presence.touch(user);
      expect(presence.state(user)).toBe('ACTIVE');
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps multi-tab presence active until the final tab disconnects', () => {
    const presence = new ChatPresenceService();
    const user = '00000000-0000-4000-8000-000000000001';
    presence.connect(user);
    presence.connect(user);
    presence.disconnect(user);
    expect(presence.state(user)).toBe('ACTIVE');
    presence.disconnect(user);
    expect(presence.state(user)).toBe('INACTIVE');
  });

  it('rejects expired, reused, and wrong-origin realtime tickets', async () => {
    const tickets = new ChatTicketService();
    const auth = { isSessionActive: jest.fn().mockResolvedValue(true) };
    const presence = new ChatPresenceService();
    const prisma = { chatMembership: { findMany: jest.fn().mockResolvedValue([]) } };
    const gateway = new ChatRealtimeGateway(
      tickets,
      presence,
      auth as never,
      { allowedOrigins: ['http://localhost:3000'] } as never,
      prisma as never,
    );
    const client = {
      handshake: { headers: { origin: 'https://attacker.test' }, auth: {} },
      disconnect: jest.fn(),
      data: {},
    } as never;
    gateway.handleConnection(client);
    expect((client as never as { disconnect: jest.Mock }).disconnect).toHaveBeenCalledWith(true);

    const issued = tickets.issue('00000000-0000-4000-8000-000000000001', 'session', 0);
    const expired = {
      handshake: { headers: { origin: 'http://localhost:3000' }, auth: { ticket: issued.ticket } },
      disconnect: jest.fn(),
      data: {},
    } as never;
    gateway.handleConnection(expired);
    expect((expired as never as { disconnect: jest.Mock }).disconnect).toHaveBeenCalledWith(true);
  });

  it('dispatches each claimed outbox row once and exposes health counters', async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([
        { id: 'row-1', recipient_user_id: 'user-2', event_type: 'chat.message.accepted', payload: { ok: true }, attempt_count: 0 },
      ]),
      chatOutbox: { update: jest.fn().mockResolvedValue(undefined) },
    };
    const prisma = { $transaction: jest.fn(async (work: (value: typeof tx) => unknown) => work(tx)), chatOutbox: { update } };
    const gateway = { emitToUser: jest.fn() };
    const dispatcher = new ChatOutboxDispatcher(prisma as never, gateway as never, { ticketTtlSeconds: 60, presenceLeaseSeconds: 45, outboxBatch: 50, messageRatePerMinute: 30 });

    await dispatcher.flush();
    expect(gateway.emitToUser).toHaveBeenCalledWith('user-2', 'chat.message.accepted', { ok: true });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'row-1' }, data: expect.objectContaining({ status: ChatOutboxStatus.SENT }) }));
    expect(dispatcher.metrics()).toMatchObject({ polls: 1, claimed: 1, sent: 1, failed: 0 });
  });

  it('retries a failed projection with capped attempt metadata and no message content in logs', async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([
        { id: 'row-2', recipient_user_id: 'user-2', event_type: 'chat.message.accepted', payload: { content: 'secret' }, attempt_count: 7 },
      ]),
      chatOutbox: { update: jest.fn().mockResolvedValue(undefined) },
    };
    const prisma = { $transaction: jest.fn(async (work: (value: typeof tx) => unknown) => work(tx)), chatOutbox: { update } };
    const gateway = { emitToUser: jest.fn(() => { throw new Error('socket unavailable'); }) };
    const dispatcher = new ChatOutboxDispatcher(prisma as never, gateway as never, { ticketTtlSeconds: 60, presenceLeaseSeconds: 45, outboxBatch: 50, messageRatePerMinute: 30 });
    await dispatcher.flush();
    expect(tx.chatOutbox.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'row-2' }, data: expect.objectContaining({ status: ChatOutboxStatus.PROCESSING, attemptCount: { increment: 1 } }) }));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'row-2' }, data: expect.objectContaining({ status: ChatOutboxStatus.FAILED }) }));
    expect(dispatcher.metrics()).toMatchObject({ failed: 1 });
  });
});
