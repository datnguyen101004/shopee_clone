'use client';

import type {
  CartLine,
  CartShopGroup,
  PricingQuoteLine,
  PricingQuoteShop,
} from '@shopee-clone/contracts';
import { Container } from '@shopee-clone/ui';
import Link from 'next/link';
import { useState } from 'react';

import { useAuthSession } from '../auth-session-provider';
import { CartPricingPanel } from './cart-pricing-panel';
import { useCart } from './cart-provider';
import { useCartPricing } from './use-cart-pricing';

function formatCurrency(value: number): string {
  return `${new Intl.NumberFormat('vi-VN').format(value)}₫`;
}

function ignoreRejected(operation: Promise<unknown>) {
  void operation.catch(() => undefined);
}

function CartLineRow({ line, pricingLine }: { line: CartLine; pricingLine?: PricingQuoteLine }) {
  const cart = useCart();
  const maximum = Math.max(1, line.maxPurchaseQuantity);
  const [draft, setDraft] = useState<string | null>(null);

  function commitQuantity() {
    const quantity = Number(draft ?? line.quantity);
    setDraft(null);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 99) {
      return;
    }
    if (quantity !== line.quantity) ignoreRejected(cart.updateQuantity(line.id, quantity));
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
          <strong>{line.product.name}</strong>
        )}
        <span>Phân loại: {line.variant.name}</span>
        {line.issues.map((issue) => (
          <p key={issue.code} className="cart-line__issue" role="status">
            {issue.message}
          </p>
        ))}
      </div>
      <div className="cart-line__price">
        <strong>{formatCurrency(pricingLine?.sellingUnitPriceMinor ?? line.unitPriceMinor)}</strong>
        {pricingLine && pricingLine.listUnitPriceMinor > pricingLine.sellingUnitPriceMinor ? (
          <>
            <del>{formatCurrency(pricingLine.listUnitPriceMinor)}</del>
            <small>Giảm {formatCurrency(pricingLine.productDiscountMinor)}</small>
          </>
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
          value={draft ?? String(line.quantity)}
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
        <small>Còn {line.availableQuantity}</small>
      </div>
      <strong className="cart-line__subtotal">
        {formatCurrency(pricingLine?.merchandiseSubtotalMinor ?? line.lineSubtotalMinor)}
      </strong>
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

function ShopGroup({ group, quotedShop }: { group: CartShopGroup; quotedShop?: PricingQuoteShop }) {
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
          <strong id={`cart-shop-${group.shop.id}`}>{group.shop.name}</strong>
        )}
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
      {quotedShop ? (
        <footer className="cart-shop__pricing">
          <span>Giá niêm yết: {formatCurrency(quotedShop.listSubtotalMinor)}</span>
          <span>Giảm sản phẩm: −{formatCurrency(quotedShop.productDiscountMinor)}</span>
          <span>Tiền hàng: {formatCurrency(quotedShop.merchandiseSubtotalMinor)}</span>
          <span>Phí vận chuyển: {formatCurrency(quotedShop.shipping.shippingFeeMinor)}</span>
          <strong>Tổng shop: {formatCurrency(quotedShop.payableTotalMinor)}</strong>
        </footer>
      ) : null}
    </section>
  );
}

export function CartScreen() {
  const cart = useCart();
  const auth = useAuthSession();
  const currentCart = cart.state.cart;
  const pricing = useCartPricing(currentCart, cart.refresh);
  const [checkoutMessage, setCheckoutMessage] = useState('');

  if (auth.state.status === 'guest' || cart.state.status === 'unauthenticated') {
    return (
      <Container className="cart-page">
        <div className="cart-state">
          <span className="cart-state__icon" aria-hidden="true">
            🛒
          </span>
          <h1>Đăng nhập để sử dụng giỏ hàng</h1>
          <p>Giỏ hàng được lưu riêng theo tài khoản để bạn có thể tiếp tục mua sắm an toàn.</p>
          <Link href="/login?returnTo=%2Fcart">Đăng nhập</Link>
        </div>
      </Container>
    );
  }

  if (auth.state.status === 'loading' || cart.state.status === 'loading') {
    return (
      <Container className="cart-page" aria-busy="true">
        <div className="cart-state" role="status">
          Đang tải giỏ hàng…
        </div>
      </Container>
    );
  }

  const current = currentCart;
  if (!current) {
    return (
      <Container className="cart-page">
        <div className="cart-state is-error" role="alert">
          <h1>Chưa thể tải giỏ hàng</h1>
          <p>Dữ liệu giỏ hàng trên máy chủ tạm thời không khả dụng.</p>
          <button type="button" onClick={() => void cart.refresh()}>
            Thử lại
          </button>
        </div>
      </Container>
    );
  }

  if (current.summary.distinctLineCount === 0) {
    return (
      <Container className="cart-page">
        <div className="cart-state">
          <span className="cart-state__icon" aria-hidden="true">
            🛒
          </span>
          <h1>Giỏ hàng của bạn đang trống</h1>
          <p>Sản phẩm bạn thêm sẽ được lưu an toàn trên máy chủ.</p>
          <Link href="/">Tiếp tục mua sắm</Link>
        </div>
      </Container>
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

  return (
    <Container className="cart-page">
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
        {pricing.status !== 'missing-address' ? (
          <CartPricingPanel cart={current} pricing={pricing} />
        ) : null}
        {current.groups.map((group) => (
          <ShopGroup
            key={group.shop.id}
            group={group}
            quotedShop={pricing.quote?.shops.find(({ shop }) => shop.id === group.shop.id)}
          />
        ))}
        {pricing.status === 'missing-address' ? (
          <CartPricingPanel cart={current} pricing={pricing} />
        ) : null}
      </div>
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
          {pricing.status === 'ready' && pricing.quote?.cartVersion === current.version ? (
            <>
              <span>Tổng thanh toán ({pricing.quote.summary.selectedLineCount} sản phẩm)</span>
              <strong>{formatCurrency(pricing.quote.summary.payableTotalMinor)}</strong>
              <small>
                Tiền hàng {formatCurrency(pricing.quote.summary.merchandiseSubtotalMinor)} · Phí
                ship {formatCurrency(pricing.quote.summary.shippingTotalMinor)} · Giảm sản phẩm{' '}
                {formatCurrency(pricing.quote.summary.productDiscountMinor)}
              </small>
            </>
          ) : (
            <>
              <span>Tổng thanh toán</span>
              <strong>Chưa khả dụng</strong>
              <small>Chờ máy chủ xác nhận giá hiện tại và phí vận chuyển.</small>
            </>
          )}
        </div>
        <button
          type="button"
          disabled={
            current.summary.selectedValidLineCount === 0 ||
            pricing.status !== 'ready' ||
            pricing.quote?.cartVersion !== current.version
          }
          onClick={() =>
            setCheckoutMessage('Thanh toán COD và tạo đơn hàng sẽ được triển khai ở T19.')
          }
        >
          Mua hàng
        </button>
      </aside>
    </Container>
  );
}
