'use client';

import { SHIPPING_SERVICES, type CartResponse } from '@shopee-clone/contracts';
import Link from 'next/link';

import type { CartPricingState } from './use-cart-pricing';

function money(value: number): string {
  return `${new Intl.NumberFormat('vi-VN').format(value)}₫`;
}

const serviceLabels = {
  ECONOMY: 'Tiết kiệm',
  STANDARD: 'Nhanh',
  EXPRESS: 'Hỏa tốc',
} as const;

export function CartPricingPanel({
  cart,
  pricing,
}: {
  cart: CartResponse;
  pricing: CartPricingState;
}) {
  if (pricing.status === 'loading-addresses') {
    return (
      <section className="cart-pricing" aria-busy="true">
        Đang tải địa chỉ nhận hàng…
      </section>
    );
  }
  if (pricing.status === 'missing-address') {
    return (
      <section
        className="cart-pricing cart-pricing--required"
        aria-labelledby="pricing-address-required"
      >
        <div>
          <h2 id="pricing-address-required">Cần địa chỉ nhận hàng</h2>
          <p>{pricing.message}</p>
        </div>
        <Link href="/account/addresses">Quản lý địa chỉ</Link>
      </section>
    );
  }

  const quoteCurrent = pricing.quote?.cartVersion === cart.version;
  return (
    <section className="cart-pricing" aria-labelledby="cart-pricing-title">
      <header>
        <div>
          <p>BẢNG GIÁ MÁY CHỦ</p>
          <h2 id="cart-pricing-title">Địa chỉ và vận chuyển</h2>
        </div>
        {pricing.addresses.length ? (
          <label>
            Địa chỉ nhận hàng
            <select
              value={pricing.selectedAddressId}
              onChange={(event) => pricing.setAddress(event.target.value)}
            >
              {pricing.addresses.map((address) => (
                <option key={address.id} value={address.id}>
                  {address.label ? `${address.label} · ` : ''}
                  {address.district}, {address.province}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </header>

      {cart.groups
        .filter(({ selectedEligibleLineCount }) => selectedEligibleLineCount > 0)
        .map((group) => {
          const quotedShop = pricing.quote?.shops.find(({ shop }) => shop.id === group.shop.id);
          return (
            <div className="cart-pricing__shop" key={group.shop.id}>
              <strong>{group.shop.name}</strong>
              <label>
                Dịch vụ giao hàng
                <select
                  aria-label={`Dịch vụ giao hàng ${group.shop.name}`}
                  value={pricing.services[group.shop.id] ?? 'STANDARD'}
                  onChange={(event) =>
                    pricing.setService(
                      group.shop.id,
                      event.target.value as keyof typeof serviceLabels,
                    )
                  }
                >
                  {SHIPPING_SERVICES.map((service) => (
                    <option key={service} value={service}>
                      {serviceLabels[service]}
                    </option>
                  ))}
                </select>
              </label>
              {quotedShop ? (
                <span>
                  MOCK · {quotedShop.shipping.estimatedDaysMin}–
                  {quotedShop.shipping.estimatedDaysMax} ngày ·{' '}
                  {money(quotedShop.shipping.shippingFeeMinor)}
                </span>
              ) : (
                <span>Đang chờ báo giá…</span>
              )}
            </div>
          );
        })}

      <div
        className={
          pricing.status === 'error' ? 'cart-pricing__status is-error' : 'cart-pricing__status'
        }
        aria-live="polite"
        role={pricing.status === 'error' ? 'alert' : 'status'}
      >
        <span>{pricing.message}</span>
        {pricing.status === 'error' ? (
          <button type="button" onClick={pricing.retry}>
            Thử lại báo giá
          </button>
        ) : null}
      </div>
      {pricing.quote && (!quoteCurrent || pricing.status === 'stale') ? (
        <p className="cart-pricing__stale">Bảng giá trước đã cũ và chỉ được giữ để tham khảo.</p>
      ) : null}
    </section>
  );
}
