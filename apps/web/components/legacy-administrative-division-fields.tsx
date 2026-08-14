'use client';

import { Dialog, DialogContent } from '@shopee-clone/ui';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  isLegacyNoWardDistrict,
  LEGACY_ADMINISTRATIVE_SNAPSHOT_DATE,
  LEGACY_NO_WARD_SENTINEL,
  LEGACY_VIETNAM_PROVINCES,
  type LegacyDistrict,
  type LegacyProvince,
  type LegacyWard,
} from '../lib/legacy-vietnam-administrative-divisions';
import {
  matchesAdministrativeSearch,
  resolveLegacyDistrict,
  resolveLegacyProvince,
  resolveLegacyWard,
} from '../lib/legacy-administrative-lookup';
import { loadLegacyWards } from '../lib/legacy-vietnam-ward-loader';

type DivisionChoice = LegacyProvince | LegacyDistrict | LegacyWard;
type DivisionName = 'province' | 'district' | 'ward';
type WardLoadStatus = 'idle' | 'loading' | 'ready' | 'error';
type WardLoadState = Readonly<{
  districtCode: string;
  status: WardLoadStatus;
  choices: readonly LegacyWard[];
}>;

const EMPTY_WARD_LOAD_STATE: WardLoadState = {
  districtCode: '',
  status: 'idle',
  choices: [],
};

function DivisionPopup({
  id,
  label,
  name,
  value,
  placeholder,
  choices,
  error,
  disabled = false,
  readOnly = false,
  loading = false,
  loadError = false,
  description,
  onRetry,
  onSelect,
}: {
  id: string;
  label: string;
  name: DivisionName;
  value: string;
  placeholder: string;
  choices: readonly DivisionChoice[];
  error?: string;
  disabled?: boolean;
  readOnly?: boolean;
  loading?: boolean;
  loadError?: boolean;
  description: string;
  onRetry?: () => void;
  onSelect: (choice: DivisionChoice) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchReference = useRef<HTMLInputElement>(null);
  const errorId = `${id}-error`;
  const statusId = `${id}-status`;
  const filteredChoices = useMemo(
    () => choices.filter((choice) => matchesAdministrativeSearch(choice.name, query)),
    [choices, query],
  );
  const describedBy = [error ? errorId : '', loading || loadError || readOnly ? statusId : '']
    .filter(Boolean)
    .join(' ');

  function setPopupOpen(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) setQuery('');
  }

  return (
    <div
      className="sc-field buyer-division-field"
      data-invalid={Boolean(error) || undefined}
      data-readonly={readOnly || undefined}
    >
      <label className="sc-field__label" htmlFor={id}>
        {label}
      </label>
      {error ? (
        <span className="sc-field__error" id={errorId} role="alert">
          {error}
        </span>
      ) : null}
      <input type="hidden" name={name} value={value} />
      <button
        id={id}
        className="buyer-division-trigger"
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-describedby={describedBy || undefined}
        aria-busy={loading || undefined}
        disabled={disabled || readOnly || loading || loadError}
        onClick={() => setPopupOpen(true)}
      >
        <span data-placeholder={!value || undefined}>{value || placeholder}</span>
        <span aria-hidden="true">⌄</span>
      </button>
      {loading ? (
        <span className="buyer-division-field__status" id={statusId} role="status">
          Đang tải danh sách phường/xã…
        </span>
      ) : loadError ? (
        <span className="buyer-division-field__status is-error" id={statusId} role="alert">
          Không thể tải danh sách phường/xã.
          <button type="button" onClick={onRetry}>
            Thử lại
          </button>
        </span>
      ) : readOnly ? (
        <span className="buyer-division-field__status" id={statusId}>
          Quận/huyện này không tổ chức đơn vị hành chính cấp xã.
        </span>
      ) : null}
      <Dialog open={open} onOpenChange={setPopupOpen}>
        <DialogContent
          className="buyer-division-dialog"
          title={`Chọn ${label.toLocaleLowerCase('vi-VN')}`}
          description={description}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            searchReference.current?.focus();
          }}
        >
          <div className="buyer-division-dialog__search">
            <label htmlFor={`${id}-search`}>Tìm kiếm {label.toLocaleLowerCase('vi-VN')}</label>
            <input
              ref={searchReference}
              id={`${id}-search`}
              className="sc-input"
              type="search"
              value={query}
              placeholder="Nhập tên có hoặc không dấu"
              autoComplete="off"
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
          </div>
          {filteredChoices.length > 0 ? (
            <ul className="buyer-division-dialog__list" role="listbox" aria-label={label}>
              {filteredChoices.map((choice) => (
                <li key={choice.code} role="none">
                  <button
                    type="button"
                    role="option"
                    aria-selected={choice.name === value}
                    onClick={() => {
                      onSelect(choice);
                      setPopupOpen(false);
                    }}
                  >
                    {choice.name}
                    {choice.name === value ? <span aria-hidden="true">✓</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="buyer-division-dialog__empty" role="status">
              Không tìm thấy lựa chọn phù hợp.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function LegacyAdministrativeDivisionFields({
  initialProvince = '',
  initialDistrict = '',
  initialWard = '',
  provinceError,
  districtError,
  wardError,
  disabled = false,
}: {
  initialProvince?: string;
  initialDistrict?: string;
  initialWard?: string;
  provinceError?: string;
  districtError?: string;
  wardError?: string;
  disabled?: boolean;
}) {
  const [province, setProvince] = useState(initialProvince);
  const [district, setDistrict] = useState(initialDistrict);
  const [ward, setWard] = useState(initialWard);
  const [wardLoadState, setWardLoadState] = useState<WardLoadState>(EMPTY_WARD_LOAD_STATE);
  const [wardLoadAttempt, setWardLoadAttempt] = useState(0);
  const resolvedProvince = resolveLegacyProvince(province);
  const resolvedDistrict = resolveLegacyDistrict(resolvedProvince, district);
  const noWardLevel = Boolean(resolvedDistrict && isLegacyNoWardDistrict(resolvedDistrict.code));
  const wardLoadMatchesDistrict = wardLoadState.districtCode === resolvedDistrict?.code;
  const wardChoices = wardLoadMatchesDistrict ? wardLoadState.choices : [];
  const wardLoadStatus: WardLoadStatus = !resolvedDistrict
    ? 'idle'
    : noWardLevel
      ? 'ready'
      : wardLoadMatchesDistrict
        ? wardLoadState.status
        : 'loading';
  const effectiveWard = noWardLevel ? LEGACY_NO_WARD_SENTINEL : ward;
  const resolvedWard = resolveLegacyWard(wardChoices, effectiveWard);

  useEffect(() => {
    if (!resolvedDistrict || noWardLevel) return;
    let active = true;
    const districtCode = resolvedDistrict.code;
    void loadLegacyWards(resolvedDistrict.code)
      .then((choices) => {
        if (!active) return;
        setWardLoadState({ districtCode, status: 'ready', choices });
      })
      .catch(() => {
        if (!active) return;
        setWardLoadState({ districtCode, status: 'error', choices: [] });
      });
    return () => {
      active = false;
    };
  }, [noWardLevel, resolvedDistrict, wardLoadAttempt]);

  return (
    <>
      <DivisionPopup
        id="address-province"
        label="Tỉnh/Thành phố"
        name="province"
        value={province}
        placeholder="Chọn tỉnh/thành phố"
        choices={LEGACY_VIETNAM_PROVINCES}
        error={provinceError}
        disabled={disabled}
        description={`Dữ liệu 63 tỉnh/thành cũ, snapshot ${LEGACY_ADMINISTRATIVE_SNAPSHOT_DATE}. Có thể tìm kiếm không dấu.`}
        onSelect={(choice) => {
          const selectedProvince = choice as LegacyProvince;
          if (resolvedProvince?.code !== selectedProvince.code) {
            setDistrict('');
            setWard('');
            setWardLoadState(EMPTY_WARD_LOAD_STATE);
          }
          setProvince(selectedProvince.name);
        }}
      />
      <DivisionPopup
        id="address-district"
        label="Quận/Huyện"
        name="district"
        value={district}
        placeholder={resolvedProvince ? 'Chọn quận/huyện' : 'Chọn tỉnh/thành phố trước'}
        choices={resolvedProvince?.districts ?? []}
        error={districtError}
        disabled={disabled || !resolvedProvince}
        description={
          resolvedProvince
            ? `Chỉ hiển thị đơn vị thuộc ${resolvedProvince.name}.`
            : 'Hãy chọn tỉnh/thành phố trước.'
        }
        onSelect={(choice) => {
          const selectedDistrict = choice as LegacyDistrict;
          if (resolvedDistrict?.code !== selectedDistrict.code) {
            const hasNoWardLevel = isLegacyNoWardDistrict(selectedDistrict.code);
            setWard(hasNoWardLevel ? LEGACY_NO_WARD_SENTINEL : '');
            setWardLoadState({
              districtCode: selectedDistrict.code,
              status: hasNoWardLevel ? 'ready' : 'loading',
              choices: [],
            });
          }
          setDistrict(selectedDistrict.name);
        }}
      />
      <DivisionPopup
        id="address-ward"
        label="Phường/Xã"
        name="ward"
        value={effectiveWard}
        placeholder={
          resolvedDistrict
            ? wardLoadStatus === 'loading'
              ? 'Đang tải phường/xã…'
              : 'Chọn phường/xã'
            : 'Chọn quận/huyện trước'
        }
        choices={wardChoices}
        error={wardError}
        disabled={disabled || !resolvedDistrict}
        readOnly={noWardLevel}
        loading={Boolean(resolvedDistrict) && wardLoadStatus === 'loading'}
        loadError={Boolean(resolvedDistrict) && wardLoadStatus === 'error'}
        description={
          resolvedDistrict
            ? `Chỉ hiển thị phường/xã thuộc ${resolvedDistrict.name}.`
            : 'Hãy chọn quận/huyện trước.'
        }
        onRetry={() => {
          if (!resolvedDistrict) return;
          setWardLoadState({
            districtCode: resolvedDistrict.code,
            status: 'loading',
            choices: [],
          });
          setWardLoadAttempt((attempt) => attempt + 1);
        }}
        onSelect={(choice) => setWard((choice as LegacyWard).name)}
      />
      {resolvedDistrict && district !== resolvedDistrict.name ? (
        <span className="sc-visually-hidden" aria-live="polite">
          Đã nhận diện quận/huyện cũ: {resolvedDistrict.name}.
        </span>
      ) : null}
      {resolvedWard && effectiveWard !== resolvedWard.name ? (
        <span className="sc-visually-hidden" aria-live="polite">
          Đã nhận diện phường/xã cũ: {resolvedWard.name}.
        </span>
      ) : null}
    </>
  );
}
