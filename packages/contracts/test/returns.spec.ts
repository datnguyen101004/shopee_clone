import { describe, expect, it } from 'vitest';

import {
  formatReturnVersionEtag,
  parseAdminReturnDecisionRequest,
  parseBuyerReturnActionRequest,
  parseCreateReturnRequest,
  parseReturnListQuery,
  parseReturnVersionEtag,
  parseSellerReturnActionRequest,
  returnActionsFor,
} from '../src/returns';

const id = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

describe('return contracts', () => {
  it('strictly parses canonical create input and normalized text', () => {
    expect(
      parseCreateReturnRequest({
        reasonCode: 'DAMAGED',
        description: '  Sản phẩm   bị hư hỏng khi nhận hàng  ',
        items: [{ lineReference: id('1'), quantity: 2 }],
        evidenceIds: [id('2')],
      }),
    ).toEqual({
      reasonCode: 'DAMAGED',
      description: 'Sản phẩm bị hư hỏng khi nhận hàng',
      items: [{ lineReference: id('1'), quantity: 2 }],
      evidenceIds: [id('2')],
    });
    expect(
      parseCreateReturnRequest({
        reasonCode: 'DAMAGED',
        description: 'quá ngắn',
        items: [],
        evidenceIds: [],
      }),
    ).toBeNull();
    expect(
      parseCreateReturnRequest({
        reasonCode: 'DAMAGED',
        description: 'Mô tả hợp lệ có đủ hai mươi ký tự',
        items: [
          { lineReference: id('1'), quantity: 1 },
          { lineReference: id('1'), quantity: 1 },
        ],
        evidenceIds: [id('2')],
      }),
    ).toBeNull();
  });

  it('enforces audience actions and version headers', () => {
    expect(parseBuyerReturnActionRequest({ action: 'CANCEL' })).toEqual({ action: 'CANCEL' });
    expect(parseBuyerReturnActionRequest({ action: 'ACCEPT_RETURN' })).toBeNull();
    expect(
      parseSellerReturnActionRequest({
        action: 'REJECT_AND_ESCALATE',
        publicReason: '  Hình ảnh chưa làm rõ vấn đề  ',
      }),
    ).toEqual({ action: 'REJECT_AND_ESCALATE', publicReason: 'Hình ảnh chưa làm rõ vấn đề' });
    expect(
      parseSellerReturnActionRequest({ action: 'CONFIRM_RECEIPT', publicReason: 'không cần' }),
    ).toBeNull();
    expect(
      parseAdminReturnDecisionRequest({
        decision: 'APPROVE_REFUND',
        publicReason: '  Bằng chứng phù hợp với yêu cầu  ',
        internalNote: '  Đã rà soát  ',
      }),
    ).toEqual({
      decision: 'APPROVE_REFUND',
      publicReason: 'Bằng chứng phù hợp với yêu cầu',
      internalNote: 'Đã rà soát',
    });
    expect(formatReturnVersionEtag(3)).toBe('"return-3"');
    expect(parseReturnVersionEtag('"return-3"')).toBe(3);
    expect(parseReturnVersionEtag('return-3')).toBeNull();
  });

  it('binds filters and publishes only allowed state actions', () => {
    expect(
      parseReturnListQuery({
        status: 'ESCALATED',
        deadline: 'OVERDUE',
        limit: '10',
        from: '2026-08-01',
        to: '2026-08-21',
      }),
    ).toEqual({
      status: 'ESCALATED',
      deadline: 'OVERDUE',
      from: '2026-08-01',
      to: '2026-08-21',
      reference: null,
      limit: 10,
      cursor: null,
    });
    expect(parseReturnListQuery({ status: ['ESCALATED'] })).toBeNull();
    expect(parseReturnListQuery({ cursor: 'x', unknown: true })).toBeNull();
    expect(returnActionsFor('REQUESTED', 'BUYER')).toEqual([
      { action: 'CANCEL', requiresPublicReason: false },
    ]);
    expect(returnActionsFor('ESCALATED', 'ADMIN').map((action) => action.action)).toEqual([
      'APPROVE_RETURN',
      'APPROVE_REFUND',
      'REJECT',
    ]);
    expect(returnActionsFor('REFUNDED', 'SELLER')).toEqual([]);
  });
});
