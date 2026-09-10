'use client';

import { useState } from 'react';

import { formatPriceDisplay } from './catalog-utils';

export function FormattedPriceInput({
  name,
  ariaLabel,
  value,
  onChangeValue,
  placeholder,
}: {
  name: 'minPrice' | 'maxPrice';
  ariaLabel: string;
  value: number | null;
  onChangeValue: (val: number | null) => void;
  placeholder: string;
}) {
  const [displayDraft, setDisplayDraft] = useState(() => ({
    value,
    text: formatPriceDisplay(value),
  }));
  const displayValue =
    displayDraft.value === value ? displayDraft.text : formatPriceDisplay(value);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawDigits = e.target.value.replace(/\D/g, '');
    if (!rawDigits) {
      setDisplayDraft({ value: null, text: '' });
      onChangeValue(null);
      return;
    }
    const num = Number(rawDigits);
    if (!Number.isSafeInteger(num)) return;
    setDisplayDraft({ value: num, text: new Intl.NumberFormat('vi-VN').format(num) });
    onChangeValue(num);
  };

  return (
    <div className="shopee-price-input-box">
      <span className="shopee-price-currency" aria-hidden="true">
        ₫
      </span>
      <input
        type="hidden"
        name={name}
        value={value !== null && value !== undefined ? String(value) : ''}
      />
      <input
        aria-label={ariaLabel}
        type="text"
        inputMode="numeric"
        value={displayValue}
        onChange={handleChange}
        placeholder={placeholder}
        className="shopee-price-control"
      />
    </div>
  );
}
