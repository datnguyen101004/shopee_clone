import { describe, expect, it } from 'vitest';

import {
  AUDIT_ACTION_LABELS,
  AUDIT_TARGET_LABELS,
  formatAuditSummaryValue,
  getAuditTargetIdLabel,
  getAuditSummaryChanges,
} from './admin-audit-display';

describe('admin audit display helpers', () => {
  it('uses clear Vietnamese labels for moderation audit targets and actions', () => {
    expect(AUDIT_TARGET_LABELS.REVIEW).toBe('Đánh giá');
    expect(AUDIT_TARGET_LABELS.MODERATION_CASE).toBe('Hồ sơ kiểm duyệt');
    expect(AUDIT_ACTION_LABELS.HIDE).toBe('Ẩn đánh giá');
    expect(AUDIT_ACTION_LABELS.NO_ACTION).toBe('Không áp dụng biện pháp');
    expect(getAuditTargetIdLabel('MODERATION_CASE')).toBe('Mã hồ sơ kiểm duyệt');
    expect(getAuditTargetIdLabel('REVIEW')).toBe('Mã đánh giá');
  });

  it('presents only changed summary fields instead of a raw JSON payload', () => {
    expect(
      getAuditSummaryChanges(
        { visibility: 'VISIBLE', name: 'Đánh giá đơn hàng' },
        { visibility: 'HIDDEN', name: 'Đánh giá đơn hàng' },
      ),
    ).toEqual([
      {
        key: 'visibility',
        label: 'Trạng thái hiển thị',
        before: 'Hiển thị',
        after: 'Đã ẩn',
      },
    ]);
  });

  it('formats state, boolean, and unset values for people reading the audit trail', () => {
    expect(formatAuditSummaryValue('status', 'SUSPENDED')).toBe('Tạm ngưng');
    expect(formatAuditSummaryValue('isEnabled', true)).toBe('Có');
    expect(formatAuditSummaryValue('activeUntil', null)).toBe('Không đặt');
  });
});
