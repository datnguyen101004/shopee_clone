export type IngestionConfig = {
  region: string;
  firehoseStreamName: string;
  apiGatewayRoute: string;
  maxBatchEvents: number;
  hmacKeyId: string | null;
  hmacSecret: string | null;
  hmacToleranceSeconds: number;
};

function required(environment: NodeJS.ProcessEnv, name: string, fallback?: string): string {
  const value = environment[name]?.trim() || fallback;
  if (!value) throw new Error(`Missing clickstream ingestion configuration: ${name}`);
  return value;
}

function positiveInt(environment: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const value = Number(environment[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1 || value > 500) {
    throw new Error(`Invalid clickstream ingestion configuration: ${name}`);
  }
  return value;
}

function boundedInt(environment: NodeJS.ProcessEnv, name: string, fallback: number, max: number): number {
  const value = Number(environment[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1 || value > max) {
    throw new Error(`Invalid clickstream ingestion configuration: ${name}`);
  }
  return value;
}

export function loadIngestionConfig(environment: NodeJS.ProcessEnv = process.env): IngestionConfig {
  const region = required(environment, 'CLICKSTREAM_AWS_REGION', environment.AWS_REGION ?? 'ap-southeast-1');
  const firehoseStreamName = required(environment, 'CLICKSTREAM_FIREHOSE_STREAM_NAME', 'shopee-clickstream-raw');
  const apiGatewayRoute = required(environment, 'CLICKSTREAM_API_GATEWAY_ROUTE', '/clickstream/events');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(region)) throw new Error('Invalid clickstream ingestion configuration: CLICKSTREAM_AWS_REGION');
  if (!/^[-A-Za-z0-9._]{1,64}$/.test(firehoseStreamName)) throw new Error('Invalid clickstream ingestion configuration: CLICKSTREAM_FIREHOSE_STREAM_NAME');
  if (!apiGatewayRoute.startsWith('/') || apiGatewayRoute.includes('//')) throw new Error('Invalid clickstream ingestion configuration: CLICKSTREAM_API_GATEWAY_ROUTE');
  const hmacKeyId = environment.CLICKSTREAM_HMAC_KEY_ID?.trim() || null;
  const hmacSecret = environment.CLICKSTREAM_HMAC_SECRET?.trim() || null;
  if ((hmacKeyId === null) !== (hmacSecret === null)) throw new Error('Invalid clickstream ingestion configuration: HMAC key id and secret must be configured together');
  return {
    region,
    firehoseStreamName,
    apiGatewayRoute,
    maxBatchEvents: positiveInt(environment, 'CLICKSTREAM_MAX_BATCH_EVENTS', 500),
    hmacKeyId,
    hmacSecret,
    hmacToleranceSeconds: boundedInt(environment, 'CLICKSTREAM_HMAC_TOLERANCE_SECONDS', 300, 900),
  };
}
