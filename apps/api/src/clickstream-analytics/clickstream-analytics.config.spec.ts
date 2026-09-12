import { loadClickstreamAnalyticsConfig } from './clickstream-analytics.config';

describe('clickstream analytics configuration', () => {
  it('uses safe MVP defaults', () => {
    const config = loadClickstreamAnalyticsConfig({ NODE_ENV: 'test' });
    expect(config).toMatchObject({
      region: 'ap-southeast-1',
      athenaWorkgroup: 'clickstream-mvp',
      attributionWindowMinutes: 30,
    });
  });

  it('rejects an invalid scan limit', () => {
    expect(() => loadClickstreamAnalyticsConfig({ CLICKSTREAM_ATHENA_MAX_SCAN_BYTES: '0' })).toThrow('CLICKSTREAM_ATHENA_MAX_SCAN_BYTES');
  });

  it('validates and exposes the optional runtime role ARN', () => {
    expect(loadClickstreamAnalyticsConfig({ CLICKSTREAM_ATHENA_ROLE_ARN: 'arn:aws:iam::123456789012:role/backend-athena' }).athenaRoleArn).toBe('arn:aws:iam::123456789012:role/backend-athena');
    expect(() => loadClickstreamAnalyticsConfig({ CLICKSTREAM_ATHENA_ROLE_ARN: 'not-an-arn' })).toThrow('CLICKSTREAM_ATHENA_ROLE_ARN');
  });
});
