/** Validated deployment configuration for the AWS clickstream MVP. */
export type ClickstreamPipelineConfig = {
  awsRegion: string;
  apiGatewayRoute: string;
  firehoseStreamName: string;
  rawBucket: string;
  processedBucket: string;
  athenaResultsBucket: string;
  athenaDatabase: string;
  athenaTable: string;
  athenaWorkgroup: string;
  athenaMaxScanBytes: number;
  glueJobName: string;
  attributionWindowMinutes: number;
  scheduleTimeZone: string;
};

type Environment = Record<string, string | undefined>;

function text(environment: Environment, name: string, fallback: string): string {
  const value = environment[name]?.trim() || fallback;
  if (!value) throw new Error(`Missing clickstream pipeline configuration: ${name}`);
  return value;
}

function integer(environment: Environment, name: string, fallback: number, minimum: number, maximum: number): number {
  const value = Number(environment[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(`Invalid clickstream pipeline configuration: ${name}`);
  return value;
}

function validateIdentifier(name: string, value: string): string {
  if (!/^[-A-Za-z0-9_.]{1,128}$/.test(value)) throw new Error(`Invalid clickstream pipeline configuration: ${name}`);
  return value;
}

function validateBucket(name: string, value: string): string {
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(value)) throw new Error(`Invalid clickstream pipeline configuration: ${name}`);
  return value;
}

export function loadClickstreamPipelineConfig(environment: Environment = {}): ClickstreamPipelineConfig {
  const awsRegion = text(environment, 'CLICKSTREAM_AWS_REGION', environment.AWS_REGION ?? 'ap-southeast-1');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(awsRegion)) throw new Error('Invalid clickstream pipeline configuration: CLICKSTREAM_AWS_REGION');
  const apiGatewayRoute = text(environment, 'CLICKSTREAM_API_GATEWAY_ROUTE', '/clickstream/events');
  if (!/^\/[A-Za-z0-9/_-]+$/.test(apiGatewayRoute)) throw new Error('Invalid clickstream pipeline configuration: CLICKSTREAM_API_GATEWAY_ROUTE');
  const scheduleTimeZone = text(environment, 'CLICKSTREAM_SCHEDULE_TIME_ZONE', 'Asia/Ho_Chi_Minh');
  try { new Intl.DateTimeFormat('en-US', { timeZone: scheduleTimeZone }).format(); } catch { throw new Error('Invalid clickstream pipeline configuration: CLICKSTREAM_SCHEDULE_TIME_ZONE'); }
  return {
    awsRegion,
    apiGatewayRoute,
    firehoseStreamName: validateIdentifier('CLICKSTREAM_FIREHOSE_STREAM_NAME', text(environment, 'CLICKSTREAM_FIREHOSE_STREAM_NAME', 'shopee-clickstream-raw')),
    rawBucket: validateBucket('CLICKSTREAM_RAW_BUCKET', text(environment, 'CLICKSTREAM_RAW_BUCKET', 'shopee-clickstream-raw')),
    processedBucket: validateBucket('CLICKSTREAM_PROCESSED_BUCKET', text(environment, 'CLICKSTREAM_PROCESSED_BUCKET', 'shopee-clickstream-processed')),
    athenaResultsBucket: validateBucket('CLICKSTREAM_ATHENA_RESULTS_BUCKET', text(environment, 'CLICKSTREAM_ATHENA_RESULTS_BUCKET', 'shopee-clickstream-athena-results')),
    athenaDatabase: validateIdentifier('CLICKSTREAM_ATHENA_DATABASE', text(environment, 'CLICKSTREAM_ATHENA_DATABASE', 'clickstream')),
    athenaTable: validateIdentifier('CLICKSTREAM_ATHENA_TABLE', text(environment, 'CLICKSTREAM_ATHENA_TABLE', 'raw_clickstream_events')),
    athenaWorkgroup: validateIdentifier('CLICKSTREAM_ATHENA_WORKGROUP', text(environment, 'CLICKSTREAM_ATHENA_WORKGROUP', 'clickstream-mvp')),
    athenaMaxScanBytes: integer(environment, 'CLICKSTREAM_ATHENA_MAX_SCAN_BYTES', 1_073_741_824, 1_024, 10_737_418_240),
    glueJobName: validateIdentifier('CLICKSTREAM_GLUE_JOB_NAME', text(environment, 'CLICKSTREAM_GLUE_JOB_NAME', 'shopee-clickstream-training')),
    attributionWindowMinutes: integer(environment, 'CLICKSTREAM_ATTRIBUTION_WINDOW_MINUTES', 30, 1, 1_440),
    scheduleTimeZone,
  };
}
