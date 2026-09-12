import { AthenaEngagementQueryAdapter, mapAthenaEngagementRows } from './athena-engagement.adapter';

const config = {
  region: 'ap-southeast-1', rawBucket: 'raw', athenaResultsBucket: 'results',
  athenaDatabase: 'clickstream', athenaTable: 'raw_clickstream_events', athenaWorkgroup: 'clickstream-mvp',
  athenaMaxScanBytes: 1_073_741_824, attributionWindowMinutes: 30, athenaRoleArn: null,
};

const header = { Data: [
  { VarCharValue: 'rowType' }, { VarCharValue: 'period' }, { VarCharValue: 'bucketStart' }, { VarCharValue: 'productId' },
  { VarCharValue: 'impressions' }, { VarCharValue: 'productViews' }, { VarCharValue: 'uniqueVisitors' }, { VarCharValue: 'clicks' }, { VarCharValue: 'addToCart' },
] };

describe('Athena engagement adapter', () => {
  it('maps current/previous summaries, sparse trends and product rows deterministically', () => {
    expect(mapAthenaEngagementRows([header,
      { Data: [{ VarCharValue: 'summary' }, { VarCharValue: 'current' }, {}, {}, { VarCharValue: '5' }, { VarCharValue: '3' }, { VarCharValue: '2' }, { VarCharValue: '1' }, { VarCharValue: '1' }] },
      { Data: [{ VarCharValue: 'summary' }, { VarCharValue: 'previous' }, {}, {}, { VarCharValue: '2' }, { VarCharValue: '1' }, { VarCharValue: '1' }, { VarCharValue: '0' }, { VarCharValue: '0' }] },
      { Data: [{ VarCharValue: 'trend' }, { VarCharValue: 'current' }, { VarCharValue: '2026-09-10 17:00:00.000 UTC' }, {}, { VarCharValue: '5' }, { VarCharValue: '3' }, { VarCharValue: '2' }, { VarCharValue: '1' }, { VarCharValue: '1' }] },
      { Data: [{ VarCharValue: 'product' }, { VarCharValue: 'previous' }, {}, { VarCharValue: 'product-1' }, { VarCharValue: '2' }, { VarCharValue: '1' }, { VarCharValue: '1' }, { VarCharValue: '0' }, { VarCharValue: '0' }] },
    ])).toEqual({
      current: { impressions: 5, productViews: 3, uniqueVisitors: 2, clicks: 1, addToCart: 1 },
      previous: { impressions: 2, productViews: 1, uniqueVisitors: 1, clicks: 0, addToCart: 0 },
      trends: [{ period: 'current', bucketStart: '2026-09-10T17:00:00.000Z', impressions: 5, productViews: 3, uniqueVisitors: 2, clicks: 1, addToCart: 1 }],
      products: [{ period: 'previous', productId: 'product-1', impressions: 2, productViews: 1, uniqueVisitors: 1, clicks: 0, addToCart: 0 }],
    });
  });

  it('normalizes Athena UTC bucket output after local timezone truncation', () => {
    expect(mapAthenaEngagementRows([header,
      { Data: [{ VarCharValue: 'trend' }, { VarCharValue: 'current' }, { VarCharValue: '2026-09-11 17:00:00.000 UTC' }, {}, { VarCharValue: '0' }, { VarCharValue: '0' }, { VarCharValue: '0' }, { VarCharValue: '0' }, { VarCharValue: '0' }] },
    ]).trends[0]?.bucketStart).toBe('2026-09-11T17:00:00.000Z');
  });

  it('keeps the configured workgroup/output and fetches all result pages', async () => {
    const send = jest.fn()
      .mockResolvedValueOnce({ QueryExecutionId: 'query-1' })
      .mockResolvedValueOnce({ QueryExecution: { Status: { State: 'SUCCEEDED' } } })
      .mockResolvedValueOnce({ ResultSet: { Rows: [header] }, NextToken: 'next' })
      .mockResolvedValueOnce({ ResultSet: { Rows: [] } });
    const adapter = new AthenaEngagementQueryAdapter(config, { send });
    await expect(adapter.query({ currentFrom: '2026-09-10T16:00:00.000Z', currentTo: '2026-09-10T17:00:00.000Z', previousFrom: '2026-09-10T15:00:00.000Z', previousTo: '2026-09-10T16:00:00.000Z', shopId: 'shop-1', timeZone: 'Asia/Ho_Chi_Minh', interval: 'hour' })).resolves.toMatchObject({ current: { impressions: 0 } });
    expect(send.mock.calls[0]![0]).toMatchObject({ input: { WorkGroup: 'clickstream-mvp', ResultConfiguration: { OutputLocation: 's3://results/athena/results/' } } });
    expect(send.mock.calls[0]![0]).toMatchObject({ input: { QueryString: expect.stringContaining("shopId = 'shop-1'") } });
    expect(send).toHaveBeenCalledTimes(4);
  });
});
