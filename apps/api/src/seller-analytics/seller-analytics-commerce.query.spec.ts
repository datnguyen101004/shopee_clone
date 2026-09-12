import { buildSellerCommerceAggregationQuery } from './seller-analytics-commerce.query';

describe('seller commerce aggregation query', () => {
  it('computes the trend bucket once before grouping so Prisma parameters stay equivalent', () => {
    const query = buildSellerCommerceAggregationQuery({
      shopId: '00000000-0000-4000-8000-000000000101',
      timeZone: 'Asia/Ho_Chi_Minh',
      currentFrom: new Date('2026-09-12T00:00:00.000Z'),
      currentTo: new Date('2026-09-13T00:00:00.000Z'),
      previousFrom: new Date('2026-09-11T00:00:00.000Z'),
      previousTo: new Date('2026-09-12T00:00:00.000Z'),
      interval: 'hour',
    });

    expect(query.sql.match(/date_trunc\(/g)).toHaveLength(1);
    expect(query.sql).toContain('FROM period_buckets GROUP BY "period", "bucketStart"');
  });
});
