'use client';

import type {
  CartLine,
  CartResponse,
  CartShopGroup,
  PricingQuoteLine,
  PricingQuoteShop,
} from '@shopee-clone/contracts';
import { CHECKOUT_DRAFT_VERSION } from '@shopee-clone/contracts';
import { StorefrontContainer } from '@shopee-clone/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { writeCheckoutDraft } from '../../lib/checkout-draft';
import { useAuthSession } from '../auth-session-provider';
import { ChatNowButton } from '../chat/chat-now-button';
import { CartPricingPanel } from './cart-pricing-panel';
import { useCart } from './cart-provider';
import { useCartPricing } from './use-cart-pricing';
import type { CartPricingState } from './use-cart-pricing';
import { ShopVoucherPicker } from './shop-voucher-picker';
import { VoucherCodeControl } from './voucher-code-control';

function formatCurrency(value: number): string {
  return `${new Intl.NumberFormat('vi-VN').format(value)}₫`;
}

function ignoreRejected(operation: Promise<unknown>) {
  void operation.catch(() => undefined);
}

function uniqueMessages(messages: string[]): string[] {
  return [...new Set(messages.map((message) => message.trim()).filter(Boolean))];
}

function purchaseBlockers(
  current: CartResponse,
  pricing: CartPricingState,
  cartStatus: 'ready' | 'error',
  cartPending: boolean,
): string[] {
  const blockers: string[] = [];
  const selectedLines = current.groups
    .flatMap((group) => group.lines)
    .filter((line) => line.selected);

  if (current.summary.selectedValidLineCount === 0) {
    const lineIssueMessages = selectedLines.flatMap((line) =>
      line.issues
        .filter((issue) => issue.code === 'unavailable' || issue.code === 'insufficient-stock')
        .map((issue) => issue.message),
    );
    blockers.push(
      ...(lineIssueMessages.length
        ? lineIssueMessages
        : selectedLines.length
          ? ['Sản phẩm đã chọn không còn đủ điều kiện để đặt hàng.']
          : ['Hãy chọn ít nhất một sản phẩm hợp lệ để mua hàng.']),
    );
  }

  if (cartPending) blockers.push('Đang cập nhật giỏ hàng, vui lòng chờ trong giây lát.');
  if (cartStatus === 'error') {
    blockers.push('Giỏ hàng chưa được đồng bộ. Hãy thử tải lại trước khi mua hàng.');
  }

  switch (pricing.status) {
    case 'missing-address':
      blockers.push('Bạn cần thêm địa chỉ nhận hàng trước khi mua hàng.');
      break;
    case 'loading-addresses':
      blockers.push('Đang kiểm tra địa chỉ nhận hàng.');
      break;
    case 'loading':
      blockers.push('Đang tính giá và phí vận chuyển.');
      break;
    case 'stale':
      blockers.push('Giá hoặc phí vận chuyển đang được cập nhật.');
      break;
    case 'error':
      blockers.push(pricing.message || 'Không thể xác nhận giá và phí vận chuyển.');
      break;
    case 'idle':
      blockers.push('Đang chuẩn bị bảng giá và phí vận chuyển.');
      break;
    case 'ready':
      if (
        !pricing.selectedAddressId ||
        !pricing.addresses.some(({ id }) => id === pricing.selectedAddressId)
      ) {
        blockers.push('Bạn cần chọn một địa chỉ nhận hàng hợp lệ.');
      }
      if (!pricing.quote) {
        blockers.push('Chưa nhận được bảng giá mới nhất từ máy chủ.');
      } else if (pricing.quote.cartVersion !== current.version) {
        blockers.push('Giỏ hàng đã thay đổi. Hãy chờ bảng giá được cập nhật.');
      } else if (
        pricing.quote.summary.selectedLineCount !== current.summary.selectedValidLineCount
      ) {
        blockers.push('Bảng giá chưa bao gồm đầy đủ sản phẩm đã chọn.');
      }
      blockers.push(...(pricing.quote?.exclusions ?? []).map((exclusion) => exclusion.message));
      break;
  }

  return uniqueMessages(blockers);
}

function CartLineRow({ line, pricingLine }: { line: CartLine; pricingLine?: PricingQuoteLine }) {
  const cart = useCart();
  const isFlashSale = pricingLine?.campaignPrice?.campaignTypeCode === 'FLASH_SALE';
  const maximum = isFlashSale ? 1 : Math.max(1, line.maxPurchaseQuantity);
  const [draft, setDraft] = useState<string | null>(null);

  function commitQuantity() {
    const quantity = Number(draft ?? line.quantity);
    setDraft(null);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 99) {
      return;
    }
    const normalizedQuantity = isFlashSale ? 1 : quantity;
    if (normalizedQuantity !== line.quantity) ignoreRejected(cart.updateQuantity(line.id, normalizedQuantity));
  }

  return (
    <article className="cart-line" data-testid="cart-line">
      <label className="cart-check">
        <input
          type="checkbox"
          checked={line.effectivelySelected}
          disabled={cart.pending || !line.eligible || line.quantity > maximum}
          onChange={(event) => ignoreRejected(cart.selectLine(line.id, event.target.checked))}
        />
        <span className="sc-visually-hidden">Chọn {line.product.name}</span>
      </label>
      <div className="cart-line__media">
        {line.product.imageUrl ? (
          <img
            src={line.product.imageUrl}
            alt={line.product.imageAlt}
            onError={(event) => {
              event.currentTarget.onerror = null;
              event.currentTarget.src = '/media/products/product-placeholder.svg';
            }}
          />
        ) : (
          <span aria-hidden="true">S</span>
        )}
      </div>
      <div className="cart-line__identity">
        {line.product.href ? (
          <Link href={line.product.href}>{line.product.name}</Link>
        ) : (
          <span className="font-medium">{line.product.name}</span>
        )}
        <span>Phân loại: {line.variant.name}</span>
        {pricingLine?.campaignPrice?.campaignTypeCode === 'FLASH_SALE' && (
          <span className="cart-line__fs-badge">⚡ Flash Sale (Tối đa 1 sản phẩm)</span>
        )}
        {line.issues.map((issue) => (
          <p key={issue.code} className="cart-line__issue" role="status">
            {issue.message}
          </p>
        ))}
      </div>
      <div className="cart-line__price">
        <span className="font-medium">{formatCurrency(pricingLine?.sellingUnitPriceMinor ?? line.unitPriceMinor)}</span>
        {pricingLine && pricingLine.listUnitPriceMinor > pricingLine.sellingUnitPriceMinor ? (
          <>
            <del>{formatCurrency(pricingLine.listUnitPriceMinor)}</del>
            <small>Giảm {formatCurrency(pricingLine.productDiscountMinor)}</small>
          </>
        ) : null}
        {pricingLine && pricingLine.merchandiseVoucherDiscountMinor > 0 ? (
          <small>Mã giảm giá: −{formatCurrency(pricingLine.merchandiseVoucherDiscountMinor)}</small>
        ) : null}
        {line.previousUnitPriceMinor !== null ? (
          <del>{formatCurrency(line.previousUnitPriceMinor)}</del>
        ) : null}
      </div>
      <div className="cart-quantity" aria-label={`Số lượng ${line.product.name}`}>
        <button
          type="button"
          aria-label={`Giảm số lượng ${line.product.name}`}
          disabled={cart.pending || !line.eligible || line.quantity <= 1}
          onClick={() => {
            const quantity = Math.max(1, line.quantity - 1);
            ignoreRejected(cart.updateQuantity(line.id, quantity));
          }}
        >
          −
        </button>
        <input
          aria-label={`Nhập số lượng ${line.product.name}`}
          inputMode="numeric"
          value={draft ?? String(isFlashSale ? Math.min(line.quantity, 1) : line.quantity)}
          disabled={cart.pending || !line.eligible}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitQuantity}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
        <button
          type="button"
          aria-label={`Tăng số lượng ${line.product.name}`}
          disabled={cart.pending || !line.eligible || line.quantity >= maximum}
          onClick={() => {
            const quantity = Math.min(maximum, line.quantity + 1);
            ignoreRejected(cart.updateQuantity(line.id, quantity));
          }}
        >
          +
        </button>
        {!isFlashSale ? <small>Còn {line.availableQuantity}</small> : null}
      </div>
      <span className="cart-line__subtotal font-semibold">
        {formatCurrency(pricingLine?.merchandiseSubtotalMinor ?? line.lineSubtotalMinor)}
      </span>
      <button
        className="cart-line__remove"
        type="button"
        disabled={cart.pending}
        onClick={() => ignoreRejected(cart.removeItem(line.id))}
      >
        Xóa
      </button>
    </article>
  );
}

function ShopGroup({
  group,
  quotedShop,
  pricing,
}: {
  group: CartShopGroup;
  quotedShop?: PricingQuoteShop;
  pricing: CartPricingState;
}) {
  const cart = useCart();
  const checked =
    group.eligibleLineCount > 0 && group.selectedEligibleLineCount === group.eligibleLineCount;
  return (
    <section className="cart-shop" aria-labelledby={`cart-shop-${group.shop.id}`}>
      <header>
        <label className="cart-check">
          <input
            type="checkbox"
            checked={checked}
            disabled={cart.pending || group.eligibleLineCount === 0}
            onChange={(event) =>
              ignoreRejected(cart.selectShop(group.shop.id, event.target.checked))
            }
          />
          <span className="sc-visually-hidden">Chọn sản phẩm của {group.shop.name}</span>
        </label>
        <span aria-hidden="true" className="cart-shop__badge">
          Shop
        </span>
        {group.shop.href ? (
          <Link id={`cart-shop-${group.shop.id}`} href={group.shop.href}>
            {group.shop.name}
          </Link>
        ) : (
          <span className="font-medium" id={`cart-shop-${group.shop.id}`}>{group.shop.name}</span>
        )}
        <ChatNowButton shopId={group.shop.id} ownerUserId={quotedShop?.shop.ownerUserId} />
      </header>
      <div className="cart-shop__labels" aria-hidden="true">
        <span>Sản phẩm</span>
        <span>Đơn giá</span>
        <span>Số lượng</span>
        <span>Số tiền</span>
        <span>Thao tác</span>
      </div>
      {group.lines.map((line) => (
        <CartLineRow
          key={line.id}
          line={line}
          pricingLine={quotedShop?.lines.find(({ lineId }) => lineId === line.id)}
        />
      ))}
      <div className="cart-shop__voucher">
        <ShopVoucherPicker
          label={`Mã giảm giá của ${group.shop.name}`}
          appliedCode={
            pricing.vouchers.shopCodes?.find(({ shopId }) => shopId === group.shop.id)?.code
          }
          result={pricing.quote?.vouchers.find(
            ({ slot, shopId }) => slot === 'SHOP' && shopId === group.shop.id,
          )}
          options={(pricing.quote?.availableShopVouchers ?? []).filter(
            (item) => item.shopId === group.shop.id,
          )}
          pending={pricing.status === 'loading' || pricing.status === 'stale'}
          onApply={(code) => pricing.setShopVoucher(group.shop.id, code)}
        />
      </div>
      {quotedShop ? (
        <footer className="cart-shop__pricing">
          <span>Giá niêm yết: {formatCurrency(quotedShop.listSubtotalMinor)}</span>
          <span>Giảm sản phẩm: −{formatCurrency(quotedShop.productDiscountMinor)}</span>
          <span>Tiền hàng: {formatCurrency(quotedShop.merchandiseSubtotalMinor)}</span>
          <span>Giảm mã shop: −{formatCurrency(quotedShop.shopVoucherDiscountMinor)}</span>
          <span>Giảm mã Shopee: −{formatCurrency(quotedShop.platformVoucherDiscountMinor)}</span>
          <span>Phí vận chuyển: {formatCurrency(quotedShop.shippingPayableMinor)}</span>
          <span className="font-semibold">Tổng shop: {formatCurrency(quotedShop.payableTotalMinor)}</span>
        </footer>
      ) : null}
    </section>
  );
}

function CartVoucherPanel({ pricing }: { pricing: CartPricingState }) {
  const pending = pricing.status === 'loading' || pricing.status === 'stale';
  return (
    <section className="cart-vouchers" aria-labelledby="cart-vouchers-title">
      <header>
        <p>ƯU ĐÃI</p>
        <h2 id="cart-vouchers-title">Mã giảm giá</h2>
      </header>
      <div className="cart-vouchers__controls">
        <div className="cart-vouchers__platform">
          <VoucherCodeControl
            label="Mã Shopee"
            appliedCode={pricing.vouchers.platformCode}
            result={pricing.quote?.vouchers.find(({ slot }) => slot === 'PLATFORM')}
            pending={pending}
            onApply={pricing.setPlatformVoucher}
          />
          <ShopVoucherPicker
            label="Voucher Shopee"
            appliedCode={pricing.vouchers.platformCode}
            result={pricing.quote?.vouchers.find(({ slot }) => slot === 'PLATFORM')}
            options={pricing.quote?.availablePlatformVouchers ?? []}
            pending={pending}
            onApply={pricing.setPlatformVoucher}
          />
        </div>
        <div className="cart-vouchers__shipping">
          <VoucherCodeControl
            label="Mã miễn phí vận chuyển"
            appliedCode={pricing.vouchers.freeShippingCode}
            result={pricing.quote?.vouchers.find(({ slot }) => slot === 'FREE_SHIPPING')}
            pending={pending}
            onApply={pricing.setFreeShippingVoucher}
          />
          <ShopVoucherPicker
            label="Voucher vận chuyển"
            appliedCode={pricing.vouchers.freeShippingCode}
            result={pricing.quote?.vouchers.find(({ slot }) => slot === 'FREE_SHIPPING')}
            options={pricing.quote?.availableShippingVouchers ?? []}
            pending={pending}
            onApply={pricing.setFreeShippingVoucher}
          />
        </div>
      </div>
    </section>
  );
}

export function CartScreen() {
  const cart = useCart();
  const auth = useAuthSession();
  const currentCart = cart.state.cart;
  const pricing = useCartPricing(currentCart, cart.refresh);
  const router = useRouter();
  const [checkoutMessage, setCheckoutMessage] = useState('');

  if (auth.state.status === 'guest' || cart.state.status === 'unauthenticated') {
    return (
      <StorefrontContainer className="cart-page">
        <div className="cart-state">
          <span className="cart-state__icon" aria-hidden="true">
            🛒
          </span>
          <h1>Đăng nhập để sử dụng giỏ hàng</h1>
          <p>Giỏ hàng được lưu riêng theo tài khoản để bạn có thể tiếp tục mua sắm an toàn.</p>
          <Link href="/login?returnTo=%2Fcart">Đăng nhập</Link>
        </div>
      </StorefrontContainer>
    );
  }

  if (auth.state.status === 'loading' || cart.state.status === 'loading') {
    return (
      <StorefrontContainer className="cart-page" aria-busy="true">
        <div className="cart-state" role="status">
          Đang tải giỏ hàng…
        </div>
      </StorefrontContainer>
    );
  }

  const current = currentCart;
  if (!current) {
    return (
      <StorefrontContainer className="cart-page">
        <div className="cart-state is-error" role="alert">
          <h1>Chưa thể tải giỏ hàng</h1>
          <p>Dữ liệu giỏ hàng trên máy chủ tạm thời không khả dụng.</p>
          <button type="button" onClick={() => void cart.refresh()}>
            Thử lại
          </button>
        </div>
      </StorefrontContainer>
    );
  }

  if (current.summary.distinctLineCount === 0) {
    return (
      <StorefrontContainer className="cart-page">
        <div className="cart-state">
          <span className="cart-state__icon" aria-hidden="true">
            🛒
          </span>
          <h1>Giỏ hàng của bạn đang trống</h1>
          <p>Sản phẩm bạn thêm sẽ được lưu an toàn trên máy chủ.</p>
          <Link href="/">Tiếp tục mua sắm</Link>
        </div>
      </StorefrontContainer>
    );
  }

  const eligibleLineCount = current.groups.reduce(
    (total, group) => total + group.eligibleLineCount,
    0,
  );
  const allSelected =
    eligibleLineCount > 0 &&
    current.groups.every(
      (group) =>
        group.eligibleLineCount === 0 ||
        group.selectedEligibleLineCount === group.eligibleLineCount,
    );
  const purchaseBlockerMessages = purchaseBlockers(
    current,
    pricing,
    cart.state.status,
    cart.pending,
  );
  const canPurchase =
    current.summary.selectedValidLineCount > 0 &&
    cart.state.status === 'ready' &&
    !cart.pending &&
    pricing.status === 'ready' &&
    Boolean(pricing.selectedAddressId) &&
    pricing.quote?.cartVersion === current.version &&
    pricing.quote.summary.selectedLineCount === current.summary.selectedValidLineCount &&
    pricing.quote.exclusions.length === 0;
  const hasFlashSaleLine = Boolean(
    pricing.quote?.shops.some((shop) =>
      shop.lines.some((line) => line.campaignPrice?.campaignTypeCode === 'FLASH_SALE'),
    ),
  );
  const displayedPurchaseBlockers = canPurchase
    ? []
    : purchaseBlockerMessages.length
      ? purchaseBlockerMessages
      : ['Hãy hoàn tất các điều kiện trước khi mua hàng.'];

  return (
    <StorefrontContainer className="cart-page">
      <div className="cart-page__heading">
        <div>
          <p>GIỎ HÀNG · {current.summary.distinctLineCount} SẢN PHẨM</p>
          <h1>Giỏ hàng của bạn</h1>
        </div>
        <span>Đã đồng bộ tài khoản</span>
      </div>
      <div
        className={
          cart.state.status === 'error' ? 'cart-announcement is-error' : 'cart-announcement'
        }
        aria-live="polite"
        role={cart.state.status === 'error' ? 'alert' : 'status'}
      >
        <span>{cart.message || checkoutMessage}</span>
        {cart.state.status === 'error' ? (
          <button type="button" disabled={cart.pending} onClick={() => void cart.refresh()}>
            Thử lại
          </button>
        ) : null}
      </div>
      <div className="cart-groups">
        {current.groups.map((group) => (
          <ShopGroup
            key={group.shop.id}
            group={group}
            quotedShop={pricing.quote?.shops.find(({ shop }) => shop.id === group.shop.id)}
            pricing={pricing}
          />
        ))}
      </div>
      <CartVoucherPanel pricing={pricing} />
      <CartPricingPanel cart={current} pricing={pricing} />
      <aside className="cart-summary" aria-label="Tổng kết giỏ hàng">
        <label className="cart-check">
          <input
            type="checkbox"
            checked={allSelected}
            disabled={cart.pending || eligibleLineCount === 0}
            onChange={(event) => ignoreRejected(cart.selectAll(event.target.checked))}
          />
          Chọn tất cả ({current.summary.distinctLineCount})
        </label>
        <div>
          {canPurchase &&
          pricing.status === 'ready' &&
          pricing.quote?.cartVersion === current.version ? (
            <>
              <span>Tổng thanh toán ({pricing.quote.summary.selectedLineCount} sản phẩm)</span>
              <strong>{formatCurrency(pricing.quote.summary.payableTotalMinor)}</strong>
              <small>
                Tiền hàng {formatCurrency(pricing.quote.summary.merchandiseSubtotalMinor)} · Giảm
                sản phẩm {formatCurrency(pricing.quote.summary.productDiscountMinor)} · Mã shop{' '}
                {formatCurrency(pricing.quote.summary.shopVoucherDiscountMinor)} · Mã Shopee{' '}
                {formatCurrency(pricing.quote.summary.platformVoucherDiscountMinor)} · Mã vận chuyển{' '}
                {formatCurrency(pricing.quote.summary.shippingVoucherDiscountMinor)} · Phí ship{' '}
                {formatCurrency(pricing.quote.summary.shippingPayableMinor)}
              </small>
            </>
          ) : pricing.status === 'missing-address' &&
            pricing.quote?.cartVersion === current.version ? (
            <>
              <span>Tạm tính tiền hàng sau voucher</span>
              <strong>
                {formatCurrency(
                  pricing.quote.summary.merchandiseSubtotalMinor -
                    pricing.quote.summary.merchandiseVoucherDiscountMinor,
                )}
              </strong>
              <small>
                Mã shop {formatCurrency(pricing.quote.summary.shopVoucherDiscountMinor)} · Mã Shopee{' '}
                {formatCurrency(pricing.quote.summary.platformVoucherDiscountMinor)} · Chưa gồm phí
                và voucher vận chuyển
              </small>
              <ul className="cart-summary__blockers" aria-label="Lý do chưa thể mua hàng">
                {displayedPurchaseBlockers.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <span>Tổng thanh toán</span>
              <span>Chưa khả dụng</span>
              <ul className="cart-summary__blockers" aria-label="Lý do chưa thể mua hàng">
                {displayedPurchaseBlockers.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </>
          )}
        </div>
        {hasFlashSaleLine && (
          <div className="cart-fs-cod-notice" role="note">
            ⚡ Đơn có sản phẩm Flash Sale chỉ hỗ trợ thanh toán khi nhận hàng (COD).
          </div>
        )}
        <button
          type="button"
          disabled={!canPurchase}
          onClick={() => {
            if (
              !canPurchase ||
              pricing.status !== 'ready' ||
              !pricing.quote ||
              !pricing.selectedAddressId
            ) {
              setCheckoutMessage(
                displayedPurchaseBlockers[0] ??
                  'Hãy chờ máy chủ xác nhận giá trước khi thanh toán.',
              );
              return;
            }
            writeCheckoutDraft(window.sessionStorage, {
              version: CHECKOUT_DRAFT_VERSION,
              cartVersion: current.version,
              shippingAddressId: pricing.selectedAddressId,
              services: Object.entries(pricing.services)
                .map(([shopId, service]) => ({ shopId, service }))
                .sort((left, right) => left.shopId.localeCompare(right.shopId)),
              ...(Object.keys(pricing.vouchers).length ? { vouchers: pricing.vouchers } : {}),
            });
            router.push('/checkout');
          }}
        >
          Mua hàng
        </button>
      </aside>
    </StorefrontContainer>
  );
}
