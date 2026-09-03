'use client';

import {
  RETURN_DESCRIPTION_MAX_LENGTH,
  RETURN_DESCRIPTION_MIN_LENGTH,
  RETURN_EVIDENCE_MAX_BYTES,
  RETURN_EVIDENCE_MAX_ITEMS,
  RETURN_EVIDENCE_MIME_TYPES,
  RETURN_REASON_CODES,
  type BuyerOrderSummary,
  type ReturnReasonCode,
} from '@shopee-clone/contracts';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { createBuyerReturn, ReturnApiError, stageReturnEvidence } from '../../lib/returns-api';
import { useAuthSession } from '../auth-session-provider';

const reasonLabels: Record<ReturnReasonCode, string> = {
  DAMAGED: 'Sản phẩm hư hỏng',
  WRONG_ITEM: 'Giao sai sản phẩm',
  MISSING_ITEM: 'Thiếu sản phẩm',
  NOT_AS_DESCRIBED: 'Không đúng mô tả',
  OTHER: 'Lý do khác',
};

const money = (value: number) => `${new Intl.NumberFormat('vi-VN').format(value)}₫`;

interface EvidencePreview {
  file: File;
  url: string;
}

export function BuyerReturnForm({ order }: { order: BuyerOrderSummary }) {
  const router = useRouter();
  const { authenticatedFetch } = useAuthSession();
  const [reasonCode, setReasonCode] = useState<ReturnReasonCode>('DAMAGED');
  const [description, setDescription] = useState('');
  const [quantities, setQuantities] = useState<Record<string, number>>(
    () => Object.fromEntries(order.lines.map((line) => [line.lineId, line.quantity])),
  );
  const [evidence, setEvidence] = useState<EvidencePreview[]>([]);
  const [descriptionTouched, setDescriptionTouched] = useState(false);
  const [stagedIds, setStagedIds] = useState<string[] | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const createKey = useRef<string | null>(null);
  const evidenceUrls = useRef(new Set<string>());

  useEffect(() => () => evidenceUrls.current.forEach((url) => URL.revokeObjectURL(url)), []);

  const selectedLines = useMemo(
    () =>
      order.lines
        .map((line) => ({ ...line, requestedQuantity: quantities[line.lineId] ?? 0 }))
        .filter((line) => line.requestedQuantity > 0),
    [order.lines, quantities],
  );
  const previewMinor = selectedLines.reduce(
    (total, line) =>
      total + Math.floor((line.merchandiseSubtotalMinor * line.requestedQuantity) / line.quantity),
    0,
  );
  const validDescription =
    description.trim().length >= RETURN_DESCRIPTION_MIN_LENGTH &&
    description.trim().length <= RETURN_DESCRIPTION_MAX_LENGTH;
  const invalid = !validDescription || selectedLines.length === 0 || evidence.length === 0;

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const available = RETURN_EVIDENCE_MAX_ITEMS - evidence.length;
    const candidates = Array.from(files)
      .filter(
        (file) =>
          RETURN_EVIDENCE_MIME_TYPES.includes(file.type as (typeof RETURN_EVIDENCE_MIME_TYPES)[number]) &&
          file.size <= RETURN_EVIDENCE_MAX_BYTES,
      )
      .slice(0, available);
    if (candidates.length !== files.length && files.length > 0)
      setMessage('Chỉ nhận tối đa 5 ảnh JPEG, PNG hoặc WebP, mỗi ảnh không quá 5 MiB.');
    setStagedIds(null);
    const previews = candidates.map((file) => ({ file, url: URL.createObjectURL(file) }));
    previews.forEach((item) => evidenceUrls.current.add(item.url));
    setEvidence((current) => [...current, ...previews]);
  };

  const removeEvidence = (index: number) => {
    setStagedIds(null);
    setEvidence((current) => {
      const item = current[index];
      if (item) {
        URL.revokeObjectURL(item.url);
        evidenceUrls.current.delete(item.url);
      }
      return current.filter((_, itemIndex) => itemIndex !== index);
    });
  };

  const submit = async () => {
    if (pending || invalid) return;
    setPending(true);
    setMessage(null);
    try {
      const evidenceIds =
        stagedIds ??
        (
          await Promise.all(evidence.map((item) => stageReturnEvidence(authenticatedFetch, item.file)))
        ).map((item) => item.evidenceId);
      if (!stagedIds) setStagedIds(evidenceIds);
      createKey.current ??= crypto.randomUUID();
      const result = await createBuyerReturn(
        authenticatedFetch,
        order.orderReference,
        order.version,
        {
          reasonCode,
          description: description.trim(),
          items: selectedLines.map((line) => ({
            lineReference: line.lineId,
            quantity: line.requestedQuantity,
          })),
          evidenceIds,
        },
        createKey.current,
      );
      router.replace(`/account/returns/${result.data.return.returnReference}`);
    } catch (error) {
      if (error instanceof ReturnApiError && error.status === 409) {
        createKey.current = null;
        setStagedIds(null);
        router.refresh();
        setMessage('Đơn hàng đã thay đổi. Vui lòng tải lại để xem trạng thái mới nhất.');
      } else {
        setMessage('Chưa thể gửi yêu cầu. Nội dung và ảnh của bạn vẫn được giữ để thử lại.');
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="return-form" aria-labelledby="return-form-title">
      <h2 id="return-form-title">Trả hàng / Hoàn tiền</h2>
      <p>
        Chọn sản phẩm cần trả. Số tiền hiển thị là ước tính từ phần hàng đã thanh toán; kết quả cuối cùng
        do hệ thống xác nhận.
      </p>

      <div className="return-form__lines">
        {order.lines.map((line) => (
          <label key={line.lineId}>
            <span>
              <strong>{line.productName}</strong>
              <small>{line.variantName}</small>
            </span>
            <input
              type="number"
              min="0"
              max={line.quantity}
              value={quantities[line.lineId] ?? 0}
              disabled={pending}
              aria-label={`Số lượng trả: ${line.productName}`}
              onChange={(event) =>
                setQuantities((current) => ({
                  ...current,
                  [line.lineId]: Math.min(
                    line.quantity,
                    Math.max(0, Number(event.target.value) || 0),
                  ),
                }))
              }
            />
          </label>
        ))}
      </div>

      <div className="return-form__fields">
        <label className="return-form__field">
          Lý do
          <select
            value={reasonCode}
            disabled={pending}
            onChange={(event) => setReasonCode(event.target.value as ReturnReasonCode)}
          >
            {RETURN_REASON_CODES.map((code) => (
              <option key={code} value={code}>
                {reasonLabels[code]}
              </option>
            ))}
          </select>
        </label>

        <label className="return-form__field">
          Mô tả vấn đề
          <textarea
            rows={5}
            minLength={RETURN_DESCRIPTION_MIN_LENGTH}
            maxLength={RETURN_DESCRIPTION_MAX_LENGTH}
            disabled={pending}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            onBlur={() => setDescriptionTouched(true)}
            placeholder="Mô tả rõ vấn đề bạn gặp phải (ít nhất 20 ký tự)."
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '-0.15rem' }}>
            {descriptionTouched && description.trim().length < RETURN_DESCRIPTION_MIN_LENGTH ? (
              <small style={{ color: '#d73211', fontSize: '0.8rem' }}>
                Mô tả cần ít nhất {RETURN_DESCRIPTION_MIN_LENGTH} ký tự (hiện có {description.trim().length} ký tự).
              </small>
            ) : <span />}
            <small className="return-form__char-count">
              {description.trim().length}/{RETURN_DESCRIPTION_MAX_LENGTH}
            </small>
          </div>
        </label>

        <div className="return-form__evidence">
          <span className="return-form__evidence-label">Ảnh bằng chứng (1–5 ảnh)</span>
          <label className="return-form__upload">
            <span>Chọn ảnh JPEG, PNG hoặc WebP · tối đa 5 MiB mỗi ảnh</span>
            <input
              type="file"
              accept={RETURN_EVIDENCE_MIME_TYPES.join(',')}
              multiple
              disabled={pending || evidence.length >= RETURN_EVIDENCE_MAX_ITEMS}
              onChange={(event) => addFiles(event.target.files)}
            />
          </label>
          <div className="return-form__previews">
            {evidence.map((item, index) => (
              <figure key={`${item.file.name}-${item.file.lastModified}-${index}`}>
                <img src={item.url} alt={`Bằng chứng ${index + 1}`} />
                <button type="button" disabled={pending} onClick={() => removeEvidence(index)}>
                  Xóa
                </button>
              </figure>
            ))}
          </div>
        </div>
      </div>

      <p className="return-form__amount">
        <span>Hoàn tiền ước tính</span>
        <strong>{money(previewMinor)}</strong>
      </p>
      {message ? (
        <p role="alert" className="return-form__message">
          {message}
        </p>
      ) : null}
      <div className="return-form__actions">
        <button
          type="button"
          className="return-form__submit"
          disabled={pending || invalid}
          onClick={() => void submit()}
        >
          {pending ? 'Đang gửi…' : 'Gửi yêu cầu trả hàng'}
        </button>
      </div>
    </section>
  );
}
