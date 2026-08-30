import {
  PAYMENT_RESULT_CLASSES,
  ProviderMalformedResponseError,
  ProviderMismatchError,
  ProviderRejectedError,
  ProviderTemporaryError,
  ProviderTimeoutError,
  classifyPaymentResult,
} from './payment-result';
import type { PaymentProviderError } from './payment-result';

describe('payment result classification', () => {
  it.each([
    ['SUCCESS', 'TERMINAL_SUCCESS', 'PAID', true, false],
    ['PENDING', 'PENDING', 'PENDING', false, true],
    ['DENIED', 'TERMINAL_FAILURE', 'FAILED', true, false],
    ['CANCELLED', 'TERMINAL_FAILURE', 'CANCELLED', true, false],
    ['EXPIRED', 'TERMINAL_FAILURE', 'EXPIRED', true, false],
    ['FAILURE', 'TERMINAL_FAILURE', 'FAILED', true, false],
    ['UNKNOWN', 'UNKNOWN', 'UNKNOWN', false, true],
  ] as const)(
    'classifies %s without losing terminal and retry semantics',
    (resultClass, decision, targetStatus, terminal, retryable) => {
      expect(classifyPaymentResult(resultClass)).toEqual({
        resultClass,
        decision,
        targetStatus,
        terminal,
        retryable,
      });
    },
  );

  it('keeps the table exhaustive', () => {
    expect(PAYMENT_RESULT_CLASSES).toHaveLength(7);
    for (const resultClass of PAYMENT_RESULT_CLASSES) {
      expect(classifyPaymentResult(resultClass).resultClass).toBe(resultClass);
    }
  });

  it('classifies correlation mismatch before provider status', () => {
    expect(classifyPaymentResult('SUCCESS', false)).toEqual({
      resultClass: 'SUCCESS',
      decision: 'MISMATCH',
      targetStatus: null,
      terminal: false,
      retryable: false,
    });
  });
});

describe('payment provider error taxonomy', () => {
  it.each([
    [ProviderTemporaryError, 'PROVIDER_TEMPORARY', true, false],
    [ProviderTimeoutError, 'PROVIDER_TIMEOUT', true, true],
    [ProviderMismatchError, 'PROVIDER_MISMATCH', false, true],
    [ProviderRejectedError, 'PROVIDER_REJECTED', false, false],
    [ProviderMalformedResponseError, 'PROVIDER_MALFORMED_RESPONSE', true, true],
  ] as const)(
    '%s exposes stable handling semantics',
    (ErrorType, code, retryable, outcomeUnknown) => {
      const error: PaymentProviderError = new ErrorType('safe message');
      expect(error).toMatchObject({ code, retryable, outcomeUnknown, message: 'safe message' });
    },
  );
});
