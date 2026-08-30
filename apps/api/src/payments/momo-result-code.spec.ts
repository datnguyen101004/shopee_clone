import {
  MomoResultCodeMetrics,
  classifyMomoResultCode,
  type MomoOperation,
} from './momo-result-code';

describe('MoMo result-code mapping', () => {
  it.each([
    [0, 'CREATE', 'PENDING', false],
    [0, 'PAYMENT_OBSERVATION', 'SUCCESS', true],
    [0, 'REFUND', 'SUCCESS', true],
    [9000, 'CREATE', 'PENDING', false],
    [9000, 'PAYMENT_OBSERVATION', 'SUCCESS', true],
    [9000, 'REFUND', 'PENDING', false],
    [1000, 'PAYMENT_OBSERVATION', 'PENDING', false],
    [7000, 'PAYMENT_OBSERVATION', 'PENDING', false],
    [7002, 'PAYMENT_OBSERVATION', 'PENDING', false],
    [1005, 'PAYMENT_OBSERVATION', 'EXPIRED', true],
    [1006, 'PAYMENT_OBSERVATION', 'DENIED', true],
    [1017, 'PAYMENT_OBSERVATION', 'CANCELLED', true],
  ] as const)('maps %s for %s to %s', (resultCode, operation, resultClass, final) => {
    expect(classifyMomoResultCode(resultCode, operation)).toEqual({
      resultClass,
      final,
      recognized: true,
    });
  });

  it.each([98, 99, 1001, 1002, 1003, 1004, 1007, 1026, 1080, 1081, 1088, 2019, 4001, 4002, 4100])(
    'maps documented final failure %s to FAILURE',
    (resultCode) => {
      expect(classifyMomoResultCode(resultCode, 'PAYMENT_OBSERVATION')).toEqual({
        resultClass: 'FAILURE',
        final: true,
        recognized: true,
      });
    },
  );

  it.each([10, 11, 12, 13, 20, 21, 22, 40, 41, 42, 43, 45, 47])(
    'keeps documented non-final code %s UNKNOWN without counting it as a new code',
    (resultCode) => {
      const metrics = new MomoResultCodeMetrics();
      expect(classifyMomoResultCode(resultCode, 'CREATE', metrics)).toEqual({
        resultClass: 'UNKNOWN',
        final: false,
        recognized: true,
      });
      expect(metrics.snapshot()).toEqual({});
    },
  );

  it('keeps unknown codes non-terminal and records a low-cardinality metric', () => {
    const metrics = new MomoResultCodeMetrics();
    for (const operation of ['CREATE', 'PAYMENT_OBSERVATION', 'REFUND'] as MomoOperation[]) {
      expect(classifyMomoResultCode(123_456, operation, metrics)).toEqual({
        resultClass: 'UNKNOWN',
        final: false,
        recognized: false,
      });
    }
    classifyMomoResultCode(123_456, 'CREATE', metrics);
    expect(metrics.snapshot()).toEqual({
      'CREATE:123456': 2,
      'PAYMENT_OBSERVATION:123456': 1,
      'REFUND:123456': 1,
    });
  });
});
