'use client';

import { Dialog, DialogContent } from '@shopee-clone/ui';
import { useMemo, useRef, useState } from 'react';

import {
  LEGACY_ADMINISTRATIVE_SNAPSHOT_DATE,
  LEGACY_VIETNAM_PROVINCES,
  type LegacyDistrict,
  type LegacyProvince,
} from '../lib/legacy-vietnam-administrative-divisions';
import {
  matchesAdministrativeSearch,
  resolveLegacyDistrict,
  resolveLegacyProvince,
} from '../lib/legacy-administrative-lookup';

type DivisionChoice = LegacyProvince | LegacyDistrict;

function DivisionPopup({
  id,
  label,
  name,
  value,
  placeholder,
  choices,
  error,
  disabled = false,
  description,
  onSelect,
}: {
  id: string;
  label: string;
  name: 'province' | 'district';
  value: string;
  placeholder: string;
  choices: readonly DivisionChoice[];
  error?: string;
  disabled?: boolean;
  description: string;
  onSelect: (choice: DivisionChoice) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchReference = useRef<HTMLInputElement>(null);
  const errorId = `${id}-error`;
  const filteredChoices = useMemo(
    () => choices.filter((choice) => matchesAdministrativeSearch(choice.name, query)),
    [choices, query],
  );

  function setPopupOpen(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) setQuery('');
  }

  return (
    <div className="sc-field buyer-division-field" data-invalid={Boolean(error) || undefined}>
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
        aria-describedby={error ? errorId : undefined}
        disabled={disabled}
        onClick={() => setPopupOpen(true)}
      >
        <span data-placeholder={!value || undefined}>{value || placeholder}</span>
        <span aria-hidden="true">⌄</span>
      </button>
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
  provinceError,
  districtError,
  disabled = false,
}: {
  initialProvince?: string;
  initialDistrict?: string;
  provinceError?: string;
  districtError?: string;
  disabled?: boolean;
}) {
  const [province, setProvince] = useState(initialProvince);
  const [district, setDistrict] = useState(initialDistrict);
  const resolvedProvince = resolveLegacyProvince(province);
  const resolvedDistrict = resolveLegacyDistrict(resolvedProvince, district);

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
          if (resolvedProvince?.code !== selectedProvince.code) setDistrict('');
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
        onSelect={(choice) => setDistrict((choice as LegacyDistrict).name)}
      />
      {resolvedDistrict && district !== resolvedDistrict.name ? (
        <span className="sc-visually-hidden" aria-live="polite">
          Đã nhận diện quận/huyện cũ: {resolvedDistrict.name}.
        </span>
      ) : null}
    </>
  );
}
