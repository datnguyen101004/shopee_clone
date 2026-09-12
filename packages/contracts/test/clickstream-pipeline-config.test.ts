import { describe, expect, it } from 'vitest';
import { loadClickstreamPipelineConfig } from '../src/clickstream-pipeline-config';

describe('clickstream pipeline configuration', () => {
  it('validates the complete secret-free deployment configuration', () => {
    expect(loadClickstreamPipelineConfig({})).toMatchObject({
      awsRegion: 'ap-southeast-1',
      rawBucket: 'shopee-clickstream-raw',
      processedBucket: 'shopee-clickstream-processed',
      athenaResultsBucket: 'shopee-clickstream-athena-results',
      glueJobName: 'shopee-clickstream-training',
      attributionWindowMinutes: 30,
      scheduleTimeZone: 'Asia/Ho_Chi_Minh',
    });
  });

  it('rejects an invalid schedule time zone or bucket', () => {
    expect(() => loadClickstreamPipelineConfig({ CLICKSTREAM_SCHEDULE_TIME_ZONE: 'Not/AZone' })).toThrow('CLICKSTREAM_SCHEDULE_TIME_ZONE');
    expect(() => loadClickstreamPipelineConfig({ CLICKSTREAM_RAW_BUCKET: 'Not a bucket' })).toThrow('CLICKSTREAM_RAW_BUCKET');
  });
});
