export const CLICKSTREAM_ANALYTICS_CONFIG = Symbol('CLICKSTREAM_ANALYTICS_CONFIG');

export type ClickstreamAnalyticsConfig = {
  region: string;
  rawBucket: string;
  athenaResultsBucket: string;
  athenaDatabase: string;
  athenaTable: string;
  athenaWorkgroup: string;
  athenaMaxScanBytes: number;
  attributionWindowMinutes: number;
  athenaRoleArn: string | null;
};

function text(environment: NodeJS.ProcessEnv, name: string, fallback?: string): string {
  const value = environment[name]?.trim() || fallback;
  if (!value) throw new Error(`Missing clickstream analytics configuration: ${name}`);
  return value;
}

function integer(environment: NodeJS.ProcessEnv, name: string, fallback: number, min: number, max: number): number {
  const value = Number(environment[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`Invalid clickstream analytics configuration: ${name}`);
  return value;
}

export function loadClickstreamAnalyticsConfig(environment: NodeJS.ProcessEnv = process.env): ClickstreamAnalyticsConfig {
  const region = text(environment, 'CLICKSTREAM_AWS_REGION', environment.AWS_REGION ?? 'ap-southeast-1');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(region)) throw new Error('Invalid clickstream analytics configuration: CLICKSTREAM_AWS_REGION');
  const athenaRoleArn = environment.CLICKSTREAM_ATHENA_ROLE_ARN?.trim() || null;
  if (athenaRoleArn && !/^arn:(?:aws|aws-us-gov|aws-cn):iam::\d{12}:role\/[A-Za-z0-9+=,.@_\-/]+$/.test(athenaRoleArn)) throw new Error('Invalid clickstream analytics configuration: CLICKSTREAM_ATHENA_ROLE_ARN');
  return {
    region,
    rawBucket: text(environment, 'CLICKSTREAM_RAW_BUCKET', 'shopee-clickstream-raw'),
    athenaResultsBucket: text(environment, 'CLICKSTREAM_ATHENA_RESULTS_BUCKET', 'shopee-clickstream-athena-results'),
    athenaDatabase: text(environment, 'CLICKSTREAM_ATHENA_DATABASE', 'clickstream'),
    athenaTable: text(environment, 'CLICKSTREAM_ATHENA_TABLE', 'raw_clickstream_events'),
    athenaWorkgroup: text(environment, 'CLICKSTREAM_ATHENA_WORKGROUP', 'clickstream-mvp'),
    athenaMaxScanBytes: integer(environment, 'CLICKSTREAM_ATHENA_MAX_SCAN_BYTES', 1_073_741_824, 1_024, 10_737_418_240),
    attributionWindowMinutes: integer(environment, 'CLICKSTREAM_ATTRIBUTION_WINDOW_MINUTES', 30, 1, 1440),
    athenaRoleArn,
  };
}
