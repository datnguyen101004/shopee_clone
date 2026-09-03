import type { AdminPrivilegedAction, AdminPrivilegedTargetType } from '@shopee-clone/contracts';

export const AUDIT_TARGET_LABELS: Record<AdminPrivilegedTargetType, string> = {
  RETURN_REQUEST: 'Yêu cầu trả hàng',
  USER: 'Người dùng',
  SHOP: 'Cửa hàng',
  CATEGORY: 'Danh mục',
  BANNER: 'Banner',
  HOMEPAGE_MODULE: 'Khối trang chủ',
  PRODUCT: 'Sản phẩm',
  REVIEW: 'Đánh giá',
  MODERATION_CASE: 'Hồ sơ kiểm duyệt',
};

export const AUDIT_ACTION_LABELS: Record<AdminPrivilegedAction, string> = {
  APPROVE_RETURN: 'Chấp thuận trả hàng',
  APPROVE_REFUND: 'Duyệt hoàn tiền',
  SUSPEND: 'Tạm ngưng',
  RESTORE: 'Khôi phục',
  CREATE: 'Tạo mới',
  UPDATE: 'Cập nhật',
  DELETE: 'Xóa',
  REORDER: 'Sắp xếp lại',
  APPROVE: 'Phê duyệt',
  REJECT: 'Từ chối',
  HIDE: 'Ẩn đánh giá',
  NO_ACTION: 'Không áp dụng biện pháp',
};

export function getAuditTargetIdLabel(targetType: AdminPrivilegedTargetType): string {
  if (targetType === 'MODERATION_CASE') return 'Mã hồ sơ kiểm duyệt';
  if (targetType === 'REVIEW') return 'Mã đánh giá';
  return 'Mã đối tượng';
}

const SUMMARY_FIELD_LABELS: Record<string, string> = {
  status: 'Trạng thái',
  moderationStatus: 'Trạng thái kiểm duyệt',
  targetStatus: 'Trạng thái đối tượng',
  visibility: 'Trạng thái hiển thị',
  outcome: 'Kết luận',
  name: 'Tên',
  title: 'Tiêu đề',
  subtitle: 'Tiêu đề phụ',
  slug: 'Đường dẫn',
  href: 'Liên kết',
  parentId: 'Mã danh mục cha',
  sortOrder: 'Thứ tự hiển thị',
  reorderedCount: 'Số mục đã sắp xếp',
  isActive: 'Đang hoạt động',
  isEnabled: 'Đang hiển thị',
  activeFrom: 'Bắt đầu hiển thị',
  activeUntil: 'Kết thúc hiển thị',
};

const SUMMARY_VALUE_LABELS: Record<string, string> = {
  ACTIVE: 'Hoạt động',
  INACTIVE: 'Không hoạt động',
  SUSPENDED: 'Tạm ngưng',
  VISIBLE: 'Hiển thị',
  HIDDEN: 'Đã ẩn',
  OPEN: 'Mở',
  IN_REVIEW: 'Đang kiểm duyệt',
  RESOLVED: 'Đã xử lý',
  NO_ACTION: 'Không áp dụng biện pháp',
  SUSPEND_TARGET: 'Tạm ngưng đối tượng',
  RESTORE_TARGET: 'Khôi phục đối tượng',
  WARN_USER: 'Cảnh cáo người dùng',
  RESTRICT_CHAT_TEMPORARY: 'Hạn chế chat tạm thời',
  RESTRICT_CHAT_INDEFINITE: 'Hạn chế chat vô thời hạn',
  RESTORE_CHAT: 'Mở lại chat',
  RESTRICTED: 'Đang hạn chế chat',
  ELIGIBLE: 'Được phép chat',
  WARNED: 'Đã cảnh cáo',
};

export interface AuditSummaryChange {
  key: string;
  label: string;
  before: string | null;
  after: string | null;
}

function formatUnknownFieldName(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (character) => character.toUpperCase());
}

function comparableValue(value: unknown): string {
  const serialized = JSON.stringify(value);
  return serialized === undefined ? String(value) : serialized;
}

function isDateSummaryField(key: string): boolean {
  return key === 'activeFrom' || key === 'activeUntil';
}

export function formatAuditSummaryValue(key: string, value: unknown): string {
  if (value === null) return 'Không đặt';
  if (typeof value === 'boolean') return value ? 'Có' : 'Không';
  if (typeof value === 'number') return value.toLocaleString('vi-VN');

  if (typeof value === 'string') {
    if (isDateSummaryField(key)) {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) return formatAuditDate(date.toISOString());
    }
    return SUMMARY_VALUE_LABELS[value] ?? value;
  }

  if (Array.isArray(value)) return value.length === 0 ? 'Không có mục nào' : `${value.length} mục`;
  if (typeof value === 'object') return 'Dữ liệu đã ghi nhận';
  return String(value);
}

export function formatAuditDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'medium',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(date);
}

export function getAuditSummaryChanges(
  beforeSummary: Record<string, unknown> | null,
  afterSummary: Record<string, unknown> | null,
): AuditSummaryChange[] {
  const before = beforeSummary ?? {};
  const after = afterSummary ?? {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];

  return keys
    .filter((key) => !(key in before && key in after && comparableValue(before[key]) === comparableValue(after[key])))
    .map((key) => ({
      key,
      label: SUMMARY_FIELD_LABELS[key] ?? formatUnknownFieldName(key),
      before: key in before ? formatAuditSummaryValue(key, before[key]) : null,
      after: key in after ? formatAuditSummaryValue(key, after[key]) : null,
    }));
}
