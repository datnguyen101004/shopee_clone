import {
  AthenaClient,
  GetQueryExecutionCommand,
  GetQueryResultsCommand,
  QueryExecutionState,
  StartQueryExecutionCommand,
} from '@aws-sdk/client-athena';
import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';
import { buildEngagementQuery, type SellerEngagementQuery } from './engagement-query';
import type { ClickstreamAnalyticsConfig } from './clickstream-analytics.config';

export type AthenaClientLike = { send(command: object): Promise<unknown> };
export type StsClientLike = { send(command: object): Promise<unknown> };
type TemporaryCredentials = { accessKeyId: string; secretAccessKey: string; sessionToken?: string };
export type AthenaClientFactory = (config: ClickstreamAnalyticsConfig, credentials?: TemporaryCredentials) => AthenaClientLike;
export type AthenaRow = { Data?: Array<{ VarCharValue?: string }> };

export type EngagementMetricCounts = {
  impressions: number;
  productViews: number;
  uniqueVisitors: number;
  clicks: number;
  addToCart: number;
};
export type EngagementPeriod = 'current' | 'previous';
export type EngagementTrendRow = EngagementMetricCounts & { period: EngagementPeriod; bucketStart: string };
export type EngagementProductRow = EngagementMetricCounts & { period: EngagementPeriod; productId: string };
export type SellerEngagementResult = {
  current: EngagementMetricCounts;
  previous: EngagementMetricCounts;
  trends: EngagementTrendRow[];
  products: EngagementProductRow[];
};

const ZERO: EngagementMetricCounts = { impressions: 0, productViews: 0, uniqueVisitors: 0, clicks: 0, addToCart: 0 };

function numeric(value: string | undefined): number {
  const parsed = Number(value ?? 0);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error('Athena returned an invalid engagement count.');
  return parsed;
}

export function normalizeAthenaTimestamp(value: string): string {
  const trimmed = value.trim();
  const isoLike = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
  const withUtc = /\s+UTC$/i.test(isoLike)
    ? isoLike.replace(/\s+UTC$/i, 'Z')
    : /(?:Z|[+-]\d{2}:?\d{2})$/i.test(isoLike) ? isoLike : `${isoLike}Z`;
  const parsed = new Date(withUtc);
  if (Number.isNaN(parsed.getTime())) throw new Error('Athena returned an invalid bucket.');
  return parsed.toISOString();
}

function metricValues(values: Array<{ VarCharValue?: string }>): EngagementMetricCounts {
  return {
    impressions: numeric(values[4]?.VarCharValue),
    productViews: numeric(values[5]?.VarCharValue),
    uniqueVisitors: numeric(values[6]?.VarCharValue),
    clicks: numeric(values[7]?.VarCharValue),
    addToCart: numeric(values[8]?.VarCharValue),
  };
}

/** Map Athena's header-plus-rows response into deterministic domain values. */
export function mapAthenaEngagementRows(rows: AthenaRow[]): SellerEngagementResult {
  const result: SellerEngagementResult = { current: { ...ZERO }, previous: { ...ZERO }, trends: [], products: [] };
  for (const row of rows.slice(1)) {
    const values = row.Data ?? [];
    const rowType = values[0]?.VarCharValue;
    const period = values[1]?.VarCharValue;
    if ((rowType !== 'summary' && rowType !== 'trend' && rowType !== 'product') || (period !== 'current' && period !== 'previous')) continue;
    const counts = metricValues(values);
    if (rowType === 'summary') {
      result[period] = counts;
    } else if (rowType === 'trend') {
      const bucketStart = values[2]?.VarCharValue;
      if (!bucketStart) throw new Error('Athena returned a trend row without a bucket.');
      result.trends.push({ ...counts, period, bucketStart: normalizeAthenaTimestamp(bucketStart) });
    } else {
      const productId = values[3]?.VarCharValue;
      if (!productId) throw new Error('Athena returned a product row without a product id.');
      result.products.push({ ...counts, period, productId });
    }
  }
  result.trends.sort((a, b) => a.period.localeCompare(b.period) || a.bucketStart.localeCompare(b.bucketStart));
  result.products.sort((a, b) => a.productId.localeCompare(b.productId) || a.period.localeCompare(b.period));
  return result;
}

export class AthenaEngagementQueryAdapter {
  private readonly clientOverride?: AthenaClientLike;
  private readonly sts: StsClientLike;
  private readonly clientFactory: AthenaClientFactory;
  private assumedClient?: { client: AthenaClientLike; expiresAt: number };

  constructor(
    private readonly config: ClickstreamAnalyticsConfig,
    client?: AthenaClientLike,
    sts?: StsClientLike,
    clientFactory: AthenaClientFactory = (factoryConfig, credentials) => new AthenaClient({ region: factoryConfig.region, ...(credentials ? { credentials } : {}) }) as unknown as AthenaClientLike,
  ) {
    this.clientOverride = client;
    this.sts = sts ?? (new STSClient({ region: config.region }) as unknown as StsClientLike);
    this.clientFactory = clientFactory;
  }

  private async getClient(): Promise<AthenaClientLike> {
    if (this.clientOverride) return this.clientOverride;
    if (!this.config.athenaRoleArn) return this.clientFactory(this.config);
    if (this.assumedClient && this.assumedClient.expiresAt > Date.now() + 60_000) return this.assumedClient.client;
    const assumed = await this.sts.send(new AssumeRoleCommand({ RoleArn: this.config.athenaRoleArn, RoleSessionName: 'shopee-clickstream-athena' })) as { Credentials?: { AccessKeyId?: string; SecretAccessKey?: string; SessionToken?: string; Expiration?: Date } };
    const credentials = assumed.Credentials;
    if (!credentials?.AccessKeyId || !credentials.SecretAccessKey) throw new Error('The Athena query role did not return credentials.');
    const client = this.clientFactory(this.config, { accessKeyId: credentials.AccessKeyId, secretAccessKey: credentials.SecretAccessKey, ...(credentials.SessionToken ? { sessionToken: credentials.SessionToken } : {}) });
    this.assumedClient = { client, expiresAt: credentials.Expiration?.getTime() ?? Date.now() + 900_000 };
    return client;
  }

  async query(query: SellerEngagementQuery): Promise<SellerEngagementResult> {
    const client = await this.getClient();
    const started = await client.send(new StartQueryExecutionCommand({
      QueryString: buildEngagementQuery(query, this.config.athenaDatabase, this.config.athenaTable),
      QueryExecutionContext: { Database: this.config.athenaDatabase },
      WorkGroup: this.config.athenaWorkgroup,
      ResultConfiguration: { OutputLocation: `s3://${this.config.athenaResultsBucket}/athena/results/` },
    })) as { QueryExecutionId?: string };
    if (!started.QueryExecutionId) throw new Error('Athena did not return a query execution id.');
    const id = started.QueryExecutionId;
    const deadline = Date.now() + 30_000;
    for (;;) {
      if (Date.now() >= deadline) throw new Error('Athena query timed out.');
      const execution = await client.send(new GetQueryExecutionCommand({ QueryExecutionId: id })) as { QueryExecution?: { Status?: { State?: QueryExecutionState; StateChangeReason?: string } } };
      const state = execution.QueryExecution?.Status?.State;
      if (state === QueryExecutionState.SUCCEEDED) break;
      if (state === QueryExecutionState.FAILED || state === QueryExecutionState.CANCELLED) throw new Error(execution.QueryExecution?.Status?.StateChangeReason ?? 'Athena query failed.');
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const rows: AthenaRow[] = [];
    let nextToken: string | undefined;
    do {
      const page = await client.send(new GetQueryResultsCommand({ QueryExecutionId: id, ...(nextToken ? { NextToken: nextToken } : {}) })) as { ResultSet?: { Rows?: AthenaRow[] }; NextToken?: string };
      rows.push(...(page.ResultSet?.Rows ?? []));
      nextToken = page.NextToken;
    } while (nextToken);
    return mapAthenaEngagementRows(rows);
  }
}

export { AthenaEngagementQueryAdapter as AthenaQueryAdapter };
export { AthenaEngagementQueryAdapter as AthenaEngagementAdapter };
