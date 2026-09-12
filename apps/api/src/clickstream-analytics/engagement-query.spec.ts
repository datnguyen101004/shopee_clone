import { buildEngagementPartitionPredicate, buildEngagementQuery, utcPartitions, type SellerEngagementQuery } from './engagement-query';

const query: SellerEngagementQuery = {
  currentFrom: '2026-09-10T16:00:00.000Z',
  currentTo: '2026-09-10T18:00:00.000Z',
  previousFrom: '2026-09-10T14:00:00.000Z',
  previousTo: '2026-09-10T16:00:00.000Z',
  shopId: 'shop-1',
  timeZone: 'Asia/Ho_Chi_Minh',
  interval: 'hour',
};

describe('Athena seller engagement query', () => {
  it('bounds one scan to the union of current and previous UTC partitions', () => {
    const sql = buildEngagementQuery(query, 'clickstream', 'raw_clickstream_events');
    expect(sql).toContain("schema_version = '1'");
    expect(sql).toContain("dt = '2026-09-10'");
    expect(sql).toContain("hour = '14'");
    expect(sql).toContain("hour = '17'");
    expect(sql).toContain("occurredAt >= '2026-09-10T14:00:00.000Z'");
    expect(sql).toContain("occurredAt < '2026-09-10T18:00:00.000Z'");
    expect(sql).toContain("shopId = 'shop-1'");
    expect(sql).toContain("eventType IN ('product_impression', 'recommendation_impression', 'product_clicked', 'recommendation_clicked', 'product_viewed', 'cart_changed')");
    expect(sql).toContain("properties.action = 'add'");
    expect(sql.match(/FROM clickstream\.raw_clickstream_events/g)).toHaveLength(1);
  });

  it('uses local bucket expressions and distinct pseudonymous viewers', () => {
    const sql = buildEngagementQuery(query, 'clickstream', 'raw_clickstream_events');
    expect(sql).toContain("date_trunc('hour'");
    expect(sql).toContain("AT TIME ZONE 'Asia/Ho_Chi_Minh'");
    expect(sql).toContain("date_trunc('hour', from_iso8601_timestamp(occurredAt) AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'UTC'");
    expect(sql).not.toContain("date_trunc('hour', from_iso8601_timestamp(occurredAt) AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh'");
    expect(sql).toContain("COUNT(DISTINCT CASE WHEN eventType = 'product_viewed'");
    expect(sql).toContain("COALESCE(NULLIF(buyerPseudonym, ''), NULLIF(sessionPseudonym, ''))");
  });

  it('enumerates the inclusive overlapping hour partition at the end boundary', () => {
    expect(utcPartitions('2026-09-10T16:30:00.000Z', '2026-09-10T18:01:00.000Z')).toEqual([
      { dt: '2026-09-10', hour: '16' },
      { dt: '2026-09-10', hour: '17' },
      { dt: '2026-09-10', hour: '18' },
    ]);
    expect(buildEngagementPartitionPredicate(query)).toContain("hour = '14'");
  });
});
