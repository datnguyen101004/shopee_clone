import { describe, expect, it, vi } from 'vitest';
import { createHash, createHmac } from 'node:crypto';
import { parseClickstreamAcknowledgement, RAW_CLICKSTREAM_HAPPY_PATH_BATCH, type ClickstreamBatch } from '@shopee-clone/contracts';
import { buildFirehoseRecords, createIngestionHandler } from '../src/handler';
import type { IngestionConfig } from '../src/config';

const config: IngestionConfig = {
  region: 'ap-southeast-1',
  firehoseStreamName: 'raw-stream',
  apiGatewayRoute: '/clickstream/events',
  maxBatchEvents: 500,
  hmacKeyId: 'dispatcher-key',
  hmacSecret: 'dispatcher-secret',
  hmacToleranceSeconds: 300,
};
const dispatcherBatch = {
  ...RAW_CLICKSTREAM_HAPPY_PATH_BATCH,
  producer: 'shopee-clone-api',
  events: RAW_CLICKSTREAM_HAPPY_PATH_BATCH.events.map((event) => ({
    ...event,
    buyerPseudonym: null,
    pseudonymKeyId: 'clickstream-prod-2026',
    properties: {},
  })),
} as unknown as ClickstreamBatch;

describe('clickstream ingestion Lambda', () => {
  it('maps a valid batch to newline-delimited Firehose records', () => {
    const records = buildFirehoseRecords(RAW_CLICKSTREAM_HAPPY_PATH_BATCH, new Date('2026-09-10T17:01:00.000Z'));
    expect(records).toHaveLength(2);
    const first = JSON.parse(Buffer.from(records[0]!.Data as Uint8Array).toString('utf8')) as Record<string, unknown>;
    expect(first).toMatchObject({ eventId: RAW_CLICKSTREAM_HAPPY_PATH_BATCH.events[0]!.eventId, ingestedAt: '2026-09-10T17:01:00.000Z' });
    expect(first).not.toHaveProperty('email');
    expect(Buffer.from(records[0]!.Data as Uint8Array).toString('utf8').endsWith('\n')).toBe(false);
  });

  it('accepts a valid API Gateway batch and passes the configured stream', async () => {
    const send = vi.fn().mockResolvedValue({ FailedPutCount: 0 });
    const now = new Date('2026-09-10T17:01:00.000Z');
    const body = JSON.stringify(dispatcherBatch);
    const sentAt = '2026-09-10T17:00:00.000Z';
    const bodyHash = createHash('sha256').update(body, 'utf8').digest('hex');
    const signature = createHmac('sha256', config.hmacSecret!).update(`${sentAt}.${bodyHash}`, 'utf8').digest('hex');
    const handle = createIngestionHandler({ send }, config, () => now);
    const response = await handle({ body, headers: { 'X-Clickstream-Key-Id': config.hmacKeyId!, 'X-Clickstream-Timestamp': sentAt, 'X-Clickstream-Signature': signature } });
    expect(response.statusCode).toBe(202);
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]![0].input.DeliveryStreamName).toBe('raw-stream');
    const acknowledgement = parseClickstreamAcknowledgement(
      JSON.parse(response.body),
      dispatcherBatch.batchId,
      dispatcherBatch.events.map((event) => event.eventId),
    );
    expect(acknowledgement).toEqual({
      batchId: dispatcherBatch.batchId,
      acceptedEventIds: dispatcherBatch.events.map((event) => event.eventId),
      rejectedEvents: [],
    });
  });
});
