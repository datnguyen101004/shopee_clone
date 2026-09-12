import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { FirehoseClient, PutRecordBatchCommand } from '@aws-sdk/client-firehose';
import { parseRawClickstreamBatch, type RawClickstreamEvent, type RawClickstreamRecord } from '@shopee-clone/contracts';
import { loadIngestionConfig, type IngestionConfig } from './config.js';

export type ApiGatewayEvent = {
  body?: string | null;
  isBase64Encoded?: boolean;
  headers?: Record<string, string | undefined>;
};

export type ApiGatewayResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

export interface FirehoseClientLike {
  send(command: PutRecordBatchCommand): Promise<{ FailedPutCount?: number | undefined; RequestResponses?: Array<{ ErrorCode?: string; ErrorMessage?: string }> }>;
}

type FirehoseRecord = { Data: Uint8Array };

function problem(status: number, detail: string): ApiGatewayResponse {
  return {
    statusCode: status,
    headers: { 'content-type': 'application/problem+json' },
    body: JSON.stringify({
      type: 'https://shopee-clone.local/problems/clickstream-ingestion',
      title: status === 400 ? 'Invalid clickstream batch' : 'Clickstream ingestion unavailable',
      status,
      detail,
    }),
  };
}

function header(event: ApiGatewayEvent, name: string): string | undefined {
  const key = Object.keys(event.headers ?? {}).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
  return key ? event.headers?.[key] : undefined;
}

export function hasValidHmacSignature(event: ApiGatewayEvent, body: string, config: IngestionConfig, now: Date): boolean {
  if (!config.hmacKeyId || !config.hmacSecret) return false;
  const keyId = header(event, 'x-clickstream-key-id');
  const sentAt = header(event, 'x-clickstream-timestamp');
  const provided = header(event, 'x-clickstream-signature');
  if (!keyId || keyId !== config.hmacKeyId || !sentAt || !provided || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(sentAt)) return false;
  const sentAtMs = Date.parse(sentAt);
  if (Number.isNaN(sentAtMs) || Math.abs(now.getTime() - sentAtMs) > config.hmacToleranceSeconds * 1_000) return false;
  const bodyHash = createHash('sha256').update(body, 'utf8').digest('hex');
  const expected = createHmac('sha256', config.hmacSecret).update(`${sentAt}.${bodyHash}`, 'utf8').digest('hex');
  const providedBytes = Buffer.from(provided, 'utf8');
  const expectedBytes = Buffer.from(expected, 'utf8');
  return providedBytes.length === expectedBytes.length && timingSafeEqual(providedBytes, expectedBytes);
}

export function decodeBatchBody(event: ApiGatewayEvent): unknown {
  if (typeof event.body !== 'string' || event.body.length === 0) return null;
  const body = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return null;
  }
}

export function toRawRecord(event: RawClickstreamEvent, ingestedAt: string): RawClickstreamRecord {
  return { ...event, ingestedAt };
}

export function buildFirehoseRecords(batch: ReturnType<typeof parseRawClickstreamBatch>, now = new Date()): FirehoseRecord[] {
  if (!batch) return [];
  const ingestedAt = now.toISOString();
  return batch.events.map((event) => ({
    // Firehose appends the single record delimiter in the delivery stream
    // processor. Keeping this payload delimiter-free avoids blank lines.
    Data: Buffer.from(JSON.stringify(toRawRecord(event, ingestedAt)), 'utf8'),
  }));
}

export function createIngestionHandler(
  firehose: FirehoseClientLike,
  config: IngestionConfig,
  now: () => Date = () => new Date(),
): (event: ApiGatewayEvent) => Promise<ApiGatewayResponse> {
  return async (event) => {
    const body = event.body && event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
    if (!config.hmacKeyId || !config.hmacSecret) return problem(503, 'Clickstream ingestion authentication is not configured.');
    if (typeof body !== 'string' || !hasValidHmacSignature(event, body, config, now())) return problem(401, 'The clickstream request signature is invalid or expired.');
    const batch = parseRawClickstreamBatch(decodeBatchBody({ ...event, body, isBase64Encoded: false }));
    if (!batch || batch.events.length > config.maxBatchEvents) {
      return problem(400, 'The batch does not match supported clickstream schema version 1.');
    }
    const records = buildFirehoseRecords(batch, now());
    try {
      const result = await firehose.send(new PutRecordBatchCommand({ DeliveryStreamName: config.firehoseStreamName, Records: records }));
      if ((result.FailedPutCount ?? 0) > 0) return problem(502, 'Firehose did not accept every clickstream event.');
      return {
        statusCode: 202,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          batchId: batch.batchId,
          acceptedEventIds: batch.events.map((event) => event.eventId),
          rejectedEvents: [],
        }),
      };
    } catch {
      return problem(502, 'The clickstream delivery stream is unavailable.');
    }
  };
}

const config = loadIngestionConfig();
const client = new FirehoseClient({ region: config.region });
export const handler = createIngestionHandler(client, config);
