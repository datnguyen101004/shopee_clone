import { describe, expect, it } from '@jest/globals';
import { handleAdmissionQueueEvent } from './admission-lambda';

describe('admission SQS Standard handler', () => {
  it('acknowledges granted/terminal tickets and redelivers waiting tickets', async () => {
    const result = await handleAdmissionQueueEvent(
      { Records: [
        { messageId: 'granted', body: JSON.stringify({ ticketId: 't1', gateId: 'checkout' }) },
        { messageId: 'waiting', body: JSON.stringify({ ticketId: 't2', gateId: 'checkout' }) },
        { messageId: 'terminal', body: JSON.stringify({ ticketId: 't3', gateId: 'checkout' }) },
      ] },
      async (ticketId) => ticketId === 't1' ? 'GRANTED' : ticketId === 't2' ? 'WAITING' : 'TERMINAL',
    );
    expect(result).toEqual({ batchItemFailures: [{ itemIdentifier: 'waiting' }] });
  });

  it('treats malformed messages as terminal input instead of retrying forever', async () => {
    await expect(handleAdmissionQueueEvent({ Records: [{ messageId: 'bad', body: '{' }] }, async () => 'GRANTED')).resolves.toEqual({ batchItemFailures: [] });
  });
});
