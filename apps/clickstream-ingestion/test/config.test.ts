import { describe, expect, it } from 'vitest';
import { loadIngestionConfig } from '../src/config';

describe('clickstream ingestion configuration', () => {
  it('loads safe defaults without secrets', () => {
    expect(loadIngestionConfig({})).toEqual({ region: 'ap-southeast-1', firehoseStreamName: 'shopee-clickstream-raw', apiGatewayRoute: '/clickstream/events', maxBatchEvents: 500, hmacKeyId: null, hmacSecret: null, hmacToleranceSeconds: 300 });
  });

  it('rejects malformed AWS route configuration', () => {
    expect(() => loadIngestionConfig({ CLICKSTREAM_API_GATEWAY_ROUTE: 'clickstream/events' })).toThrow('CLICKSTREAM_API_GATEWAY_ROUTE');
  });
});
