'use client';

import {
  SHIPPING_SERVICES,
  type CartResponse,
  type ShippingAddress,
} from '@shopee-clone/contracts';
import { useState } from 'react';

import type { CartPricingState } from './use-cart-pricing';
import { AddressCreationDialog } from '../address-creation-dialog';

function money(value: number): string {
  return `${new Intl.NumberFormat('vi-VN').format(value)}₫`;
}

const serviceLabels = {
  ECONOMY: 'Tiết kiệm',
  STANDARD: 'Nhanh',
  EXPRESS: 'Hỏa tốc',
} as const;

function formatAddressLine(address: ShippingAddress): string {
  return [address.addressLine, address.ward, address.district, address.province]
    .filter(Boolean)
    .join(', ');
}

function formatAddressOption(address: ShippingAddress): string {
  return [address.label, address.recipientName, address.phoneNumber, formatAddressLine(address)]
    .filter(Boolean)
    .join(' · ');
}

export function CartPricingPanel({
  cart,
  pricing,
}: {
  cart: CartResponse;
  pricing: CartPricingState;
}) {
  const [addressDialogOpen, setAddressDialogOpen] = useState(false);

  if (pricing.status === 'loading-addresses') {
    return (
      <section className="cart-pricing" aria-busy="true">
        Đang tải địa chỉ nhận hàng…
      </section>
    );
  }
  if (pricing.status === 'missing-address') {
    return (
      <>
        <section
          className="cart-pricing cart-pricing--required"
          aria-labelledby="pricing-address-required"
        >
          <div>
            <h2 id="pricing-address-required">Cần địa chỉ nhận hàng</h2>
            <p>{pricing.message}</p>
          </div>
          <button type="button" onClick={() => setAddressDialogOpen(true)}>
            Thêm địa chỉ nhận hàng
          </button>
        </section>
        <AddressCreationDialog
          open={addressDialogOpen}
          onOpenChange={setAddressDialogOpen}
          onCreated={() => pricing.retry()}
        />
      </>
    );
  }

  const quoteCurrent = pricing.quote?.cartVersion === cart.version;
  const selectedAddress =
    pricing.addresses.find((address) => address.id === pricing.selectedAddressId) ??
    pricing.addresses[0] ??
    null;
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
                  {formatAddressOption(address)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </header>
      {selectedAddress ? (
        <div className="cart-pricing__address">
          <div className="cart-pricing__address-heading">
            <strong>{selectedAddress.recipientName}</strong>
            <span>{selectedAddress.phoneNumber}</span>
            {selectedAddress.isDefault ? <b>Địa chỉ mặc định</b> : null}
          </div>
          <p>{formatAddressLine(selectedAddress)}</p>
          {selectedAddress.label ? <small>{selectedAddress.label}</small> : null}
        </div>
      ) : null}

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
              {quotedShop?.shipping ? (
                <span>
                  MOCK · {quotedShop.shipping.estimatedDaysMin}–
                  {quotedShop.shipping.estimatedDaysMax} ngày ·{' '}
                  {quotedShop.shippingVoucherDiscountMinor > 0 ? (
                    <>
                      <del>{money(quotedShop.shipping.shippingFeeMinor)}</del>{' '}
                      {money(quotedShop.shippingPayableMinor)}
                    </>
                  ) : (
                    money(quotedShop.shippingPayableMinor)
                  )}
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
