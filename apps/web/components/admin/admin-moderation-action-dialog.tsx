'use client';

import type {
  AdminReviewDetail,
  AdminReviewVisibilityAction,
  ModerationCaseDetail,
  ModerationDecisionOutcome,
} from '@shopee-clone/contracts';
import { useRef, type FormEvent } from 'react';

type CaseActionProps = {
  kind: 'case';
  detail: ModerationCaseDetail;
  outcome: ModerationDecisionOutcome;
  reason: string;
  privateNote: string;
  restrictionUntil: string;
  error: string | null;
  isSubmitting: boolean;
  onOutcomeChange: (value: ModerationDecisionOutcome) => void;
  onReasonChange: (value: string) => void;
  onPrivateNoteChange: (value: string) => void;
  onRestrictionUntilChange: (value: string) => void;
  onSubmit: (trigger: HTMLButtonElement | null) => void;
  onClose: () => void;
};

type ReviewActionProps = {
  kind: 'review';
  detail: AdminReviewDetail;
  action: AdminReviewVisibilityAction;
  reason: string;
  error: string | null;
  isSubmitting: boolean;
  onActionChange: (value: AdminReviewVisibilityAction) => void;
  onReasonChange: (value: string) => void;
  onSubmit: (trigger: HTMLButtonElement | null) => void;
  onClose: () => void;
};

export type AdminModerationActionDialogProps = CaseActionProps | ReviewActionProps;

function CaseActionForm({ props }: { props: CaseActionProps }) {
  const submitButtonRef = useRef<HTMLButtonElement>(null);
  const isChat = props.detail.targetType === 'CHAT_CONVERSATION' || props.detail.targetType === 'CHAT_MESSAGE';
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    props.onSubmit(submitButtonRef.current);
  };

  return (
    <form className="admin-dialog__form" onSubmit={handleSubmit}>
      <div className="admin-form-stack">
        <span className="admin-form-label">Hành động xử lý</span>
        <div className="admin-outcome-options" role="radiogroup" aria-label="Hành động xử lý report">
          {isChat ? (
            <>
              <label className="admin-outcome-pill"><input type="radio" name="dialog-outcome" checked={props.outcome === 'NO_ACTION'} onChange={() => props.onOutcomeChange('NO_ACTION')} />Không xử lý</label>
              <label className="admin-outcome-pill"><input type="radio" name="dialog-outcome" checked={props.outcome === 'WARN_USER'} onChange={() => props.onOutcomeChange('WARN_USER')} />Cảnh cáo</label>
              <label className="admin-outcome-pill"><input type="radio" name="dialog-outcome" checked={props.outcome === 'RESTRICT_CHAT_TEMPORARY'} onChange={() => props.onOutcomeChange('RESTRICT_CHAT_TEMPORARY')} />Hạn chế tạm thời</label>
              <label className="admin-outcome-pill"><input type="radio" name="dialog-outcome" checked={props.outcome === 'RESTRICT_CHAT_INDEFINITE'} onChange={() => props.onOutcomeChange('RESTRICT_CHAT_INDEFINITE')} />Hạn chế vô thời hạn</label>
              <label className="admin-outcome-pill"><input type="radio" name="dialog-outcome" checked={props.outcome === 'RESTORE_CHAT'} onChange={() => props.onOutcomeChange('RESTORE_CHAT')} />Mở lại chat</label>
            </>
          ) : props.detail.targetStatus === 'SUSPENDED' ? (
            <label className="admin-outcome-pill"><input type="radio" name="dialog-outcome" checked={props.outcome === 'RESTORE_TARGET'} onChange={() => props.onOutcomeChange('RESTORE_TARGET')} />Khôi phục</label>
          ) : (
            <>
              <label className="admin-outcome-pill"><input type="radio" name="dialog-outcome" checked={props.outcome === 'SUSPEND_TARGET'} onChange={() => props.onOutcomeChange('SUSPEND_TARGET')} />Đình chỉ</label>
              <label className="admin-outcome-pill"><input type="radio" name="dialog-outcome" checked={props.outcome === 'NO_ACTION'} onChange={() => props.onOutcomeChange('NO_ACTION')} />Không xử lý</label>
            </>
          )}
        </div>
      </div>
      <label className="admin-field" htmlFor="moderation-dialog-reason"><span>Lý do công khai (8–240 ký tự)</span><textarea id="moderation-dialog-reason" className="admin-control" value={props.reason} onChange={(event) => props.onReasonChange(event.target.value)} minLength={8} maxLength={240} rows={3} /></label>
      <label className="admin-field" htmlFor="moderation-dialog-private-note"><span>Ghi chú nội bộ {isChat ? '(bắt buộc với quyết định chat)' : '(tùy chọn)'}</span><textarea id="moderation-dialog-private-note" className="admin-control" value={props.privateNote} onChange={(event) => props.onPrivateNoteChange(event.target.value)} maxLength={2000} rows={3} /></label>
      {isChat ? <label className="admin-field" htmlFor="moderation-dialog-restriction-until"><span>Mở lại ngày (chỉ áp dụng hạn chế tạm thời)</span><input id="moderation-dialog-restriction-until" className="admin-control" type="date" value={props.restrictionUntil} onChange={(event) => props.onRestrictionUntilChange(event.target.value)} disabled={props.outcome !== 'RESTRICT_CHAT_TEMPORARY'} /></label> : null}
      {props.error ? <p className="admin-inline-error" role="alert">{props.error}</p> : null}
      <div className="admin-dialog__actions">
        <button type="button" className="admin-btn admin-btn-secondary" onClick={props.onClose} disabled={props.isSubmitting}>Hủy</button>
        <button ref={submitButtonRef} type="submit" className="admin-btn admin-btn-primary" disabled={props.isSubmitting}>{props.isSubmitting ? 'Đang xử lý…' : 'Tiếp tục xử lý'}</button>
      </div>
    </form>
  );
}

function ReviewActionForm({ props }: { props: ReviewActionProps }) {
  const submitButtonRef = useRef<HTMLButtonElement>(null);
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    props.onSubmit(submitButtonRef.current);
  };

  return (
    <form className="admin-dialog__form" onSubmit={handleSubmit}>
      <label className="admin-field" htmlFor="review-dialog-action"><span>Hành động xử lý</span><select id="review-dialog-action" className="admin-control" value={props.action} onChange={(event) => props.onActionChange(event.target.value as AdminReviewVisibilityAction)}><option value="HIDE">Ẩn đánh giá vi phạm</option><option value="RESTORE">Khôi phục hiển thị</option><option value="KEEP_VISIBLE">Giữ nguyên hiển thị</option></select></label>
      <label className="admin-field" htmlFor="review-dialog-reason"><span>Lý do xử lý (8–240 ký tự)</span><textarea id="review-dialog-reason" className="admin-control" value={props.reason} onChange={(event) => props.onReasonChange(event.target.value)} minLength={8} maxLength={240} rows={4} /></label>
      {props.error ? <p className="admin-inline-error" role="alert">{props.error}</p> : null}
      <div className="admin-dialog__actions">
        <button type="button" className="admin-btn admin-btn-secondary" onClick={props.onClose} disabled={props.isSubmitting}>Hủy</button>
        <button ref={submitButtonRef} type="submit" className="admin-btn admin-btn-primary" disabled={props.isSubmitting}>{props.isSubmitting ? 'Đang xử lý…' : 'Tiếp tục xử lý'}</button>
      </div>
    </form>
  );
}

export function AdminModerationActionDialog(props: AdminModerationActionDialogProps) {
  const title = props.kind === 'case' ? 'Xử lý report' : 'Xử lý report đánh giá';
  const description = props.kind === 'case'
    ? `Đối tượng: ${props.detail.targetName}. Chọn hành động và nhập lý do trước khi xác nhận.`
    : `Đánh giá: ${props.detail.productName}. Chọn hành động và nhập lý do trước khi xác nhận.`;

  return (
    <div className="admin-dialog-backdrop" role="presentation">
      <section className="admin-dialog admin-moderation-action-dialog" role="dialog" aria-modal="true" aria-labelledby="moderation-action-dialog-title">
        <div className="admin-dialog__header">
          <div>
            <h2 id="moderation-action-dialog-title">{title}</h2>
            <p>{description}</p>
          </div>
          <button type="button" className="admin-dialog__close" aria-label="Đóng form xử lý" onClick={props.onClose} disabled={props.isSubmitting}>×</button>
        </div>
        {props.kind === 'case' ? <CaseActionForm props={props} /> : <ReviewActionForm props={props} />}
      </section>
    </div>
  );
}
