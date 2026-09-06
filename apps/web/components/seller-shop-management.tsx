'use client';

import {
  isCreateSellerShopRequest,
  type CreateSellerShopRequest,
  type SellerShopProfile,
  type ShopServiceAddress,
} from '@shopee-clone/contracts';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { useAuthSession } from './auth-session-provider';
import { LegacyAdministrativeDivisionFields } from './legacy-administrative-division-fields';
import { RoleApiError } from '../lib/role-api';
import {
  createSellerShop,
  fetchSellerShopWorkspace,
  updateSellerRegistration,
  updateSellerShop,
} from '../lib/seller-shop-api';

const emptyAddress: ShopServiceAddress = {
  recipientName: '',
  phoneNumber: '',
  province: '',
  district: '',
  ward: '',
  addressLine: '',
};

const emptyForm: CreateSellerShopRequest = {
  slug: '',
  name: '',
  description: '',
  logoUrl: null,
  bannerUrl: null,
  location: 'Việt Nam',
  contactPhone: '',
  contactEmail: '',
  pickupAddress: emptyAddress,
  returnAddress: emptyAddress,
};

function addressOrEmpty(address: ShopServiceAddress | null): ShopServiceAddress {
  return address ? { ...address } : { ...emptyAddress };
}

function fromWorkspaceShop(
  shop: SellerShopProfile,
  defaultAddress: ShopServiceAddress | null,
): CreateSellerShopRequest {
  return {
    slug: shop.slug,
    name: shop.name,
    description: shop.description,
    logoUrl: shop.logoUrl,
    bannerUrl: shop.bannerUrl,
    location: shop.location,
    contactPhone: shop.contactPhone ?? '',
    contactEmail: shop.contactEmail ?? '',
    pickupAddress: addressOrEmpty(shop.pickupAddress ?? defaultAddress),
    returnAddress: addressOrEmpty(shop.returnAddress ?? defaultAddress),
  };
}

function newShopForm(defaultAddress: ShopServiceAddress | null): CreateSellerShopRequest {
  return {
    ...emptyForm,
    pickupAddress: addressOrEmpty(defaultAddress),
    returnAddress: addressOrEmpty(defaultAddress),
  };
}

function onboardingLabel(status: SellerShopProfile['onboardingStatus']): string {
  if (status === 'approved') return 'Đã duyệt';
  if (status === 'rejected') return 'Bị từ chối';
  return 'Chờ duyệt';
}

function statusLabel(status: SellerShopProfile['status']): string {
  if (status === 'active') return 'Đang hoạt động';
  if (status === 'suspended') return 'Bị đình chỉ';
  return 'Tạm ngừng';
}

function incompleteProfileMessage(input: CreateSellerShopRequest): string | null {
  const missing: string[] = [];
  if (!input.contactPhone.trim()) missing.push('điện thoại liên hệ');
  if (!input.contactEmail.trim()) missing.push('email liên hệ');
  for (const [label, address] of [
    ['địa chỉ lấy hàng', input.pickupAddress],
    ['địa chỉ trả hàng', input.returnAddress],
  ] as const) {
    if (!address.recipientName.trim()) missing.push(`người nhận ${label}`);
    if (!address.phoneNumber.trim()) missing.push(`số điện thoại ${label}`);
    if (!address.province.trim()) missing.push(`tỉnh/thành của ${label}`);
    if (!address.district.trim()) missing.push(`quận/huyện của ${label}`);
    if (!address.ward.trim()) missing.push(`phường/xã của ${label}`);
    if (!address.addressLine.trim()) missing.push(`địa chỉ chi tiết của ${label}`);
  }
  return missing.length > 0 ? `Hãy điền đầy đủ: ${missing.join(', ')}.` : null;
}

type SellerShopSurface = 'buyer-registration' | 'seller-management';

export function SellerShopManagement({ surface }: { surface: SellerShopSurface }) {
  const { authenticatedFetch, state: authState } = useAuthSession();
  const isBuyerRegistration = surface === 'buyer-registration';
  const isSeller = authState.status === 'authenticated' && authState.user.roles.includes('seller');
  const [shop, setShop] = useState<SellerShopProfile | null>(null);
  const [workspaceDefaultAddress, setWorkspaceDefaultAddress] = useState<ShopServiceAddress | null>(
    null,
  );
  const [form, setForm] = useState(emptyForm);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [mode, setMode] = useState<'onboarding' | 'view' | 'editing'>('onboarding');
  const [draftStatus, setDraftStatus] = useState<'active' | 'inactive'>('inactive');
  const [pending, setPending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (authState.status !== 'authenticated') return;
    let active = true;
    void fetchSellerShopWorkspace(authenticatedFetch)
      .then((workspace) => {
        if (!active) return;
        setShop(workspace.shop);
        setWorkspaceDefaultAddress(workspace.defaultAddress);
        setDraftStatus(workspace.shop?.status === 'active' ? 'active' : 'inactive');
        setForm(
          workspace.shop
            ? fromWorkspaceShop(workspace.shop, workspace.defaultAddress)
            : newShopForm(workspace.defaultAddress),
        );
        setMode(workspace.shop ? 'view' : 'onboarding');
        setStatus('ready');
      })
      .catch(() => {
        if (active) setStatus('error');
      });
    return () => {
      active = false;
    };
  }, [authState.status, authenticatedFetch, isBuyerRegistration, isSeller]);

  function normalizedPayload(): CreateSellerShopRequest {
    return {
      ...form,
      logoUrl: form.logoUrl?.trim() ? form.logoUrl.trim() : null,
      bannerUrl: form.bannerUrl?.trim() ? form.bannerUrl.trim() : null,
    };
  }

  function validatePayload(payload: CreateSellerShopRequest): boolean {
    const incompleteMessage = incompleteProfileMessage(payload);
    if (incompleteMessage) {
      setMessage(incompleteMessage);
      return false;
    }
    if (!isCreateSellerShopRequest(payload)) {
      setMessage(
        'Thông tin hồ sơ chưa hợp lệ. Kiểm tra lại slug, số điện thoại, email và địa chỉ chi tiết.',
      );
      return false;
    }
    return true;
  }

  function requestSubmit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (pending) return;
    const payload = normalizedPayload();
    if (!validatePayload(payload)) return;
    setConfirmOpen(true);
  }

  async function confirmSubmit() {
    if (pending) return;
    const payload = normalizedPayload();
    if (!validatePayload(payload)) {
      setConfirmOpen(false);
      return;
    }
    setConfirmOpen(false);
    setPending(true);
    try {
      const next = shop
        ? shop.onboardingStatus === 'approved'
          ? await updateSellerShop(authenticatedFetch, { ...payload, status: draftStatus })
          : await updateSellerRegistration(authenticatedFetch, payload)
        : await createSellerShop(authenticatedFetch, payload);
      setShop(next);
      setForm(fromWorkspaceShop(next, workspaceDefaultAddress));
      setDraftStatus(next.status === 'active' ? 'active' : 'inactive');
      setMode('view');
      setMessage(
        shop
          ? shop.onboardingStatus === 'rejected'
            ? 'Đã gửi lại hồ sơ. Shop đang chờ duyệt.'
            : 'Đã cập nhật hồ sơ shop.'
          : 'Đã gửi hồ sơ. Shop đang chờ duyệt.',
      );
    } catch (error) {
      setMessage(
        error instanceof RoleApiError
          ? error.status === 400
            ? 'Thông tin hồ sơ không hợp lệ. Kiểm tra lại số điện thoại, email và hai địa chỉ lấy/trả hàng.'
            : error.status === 403
              ? 'Phiên đăng nhập hoặc quyền bán hàng không còn hợp lệ. Hãy tải lại trang và đăng nhập lại nếu cần.'
              : error.status === 409
                ? 'Slug, tên shop hoặc hồ sơ hiện tại bị trùng.'
                : 'Không thể lưu hồ sơ shop. Kiểm tra lại thông tin và thử lại.'
          : 'Không thể lưu hồ sơ shop. Kiểm tra lại thông tin và thử lại.',
      );
    } finally {
      setPending(false);
    }
  }

  if (authState.status === 'loading') {
    return (
      <section className="operational-panel" aria-busy="true">
        <h1>Đang kiểm tra phiên</h1>
      </section>
    );
  }
  if (authState.status === 'guest') {
    return (
      <section className="operational-panel">
        <h1>Cần đăng nhập</h1>
        <a href="/login">Đăng nhập</a>
      </section>
    );
  }
  if (!authState.user.roles.includes('buyer')) {
    return (
      <section className="operational-panel" role="status">
        <h1>Không có quyền truy cập</h1>
      </section>
    );
  }
  if (!isBuyerRegistration && !isSeller && shop) {
    return (
      <section className="operational-panel" role="status">
        <h1>Bạn chưa phải người bán</h1>
        <p>Hồ sơ đăng ký shop được quản lý trong khu vực tài khoản người mua.</p>
        <Link href="/account/shop-registration">Mở hồ sơ đăng ký</Link>
      </section>
    );
  }
  if (status === 'loading') {
    return (
      <section className="operational-panel" aria-busy="true">
        <h1>Đang tải khu vực người bán</h1>
      </section>
    );
  }
  if (status === 'error') {
    return (
      <section className="operational-panel" role="alert">
        <h1>Không thể mở hồ sơ shop</h1>
        <p>Dịch vụ đang tạm thời không khả dụng.</p>
      </section>
    );
  }

  return (
    <section
      className={`operational-panel seller-shop-panel${isBuyerRegistration ? ' buyer-shop-registration-panel' : ''}`}
      aria-labelledby="seller-shop-title"
    >
      <div className={isBuyerRegistration ? undefined : 'seller-shop-management-intro'}>
        <span className="operational-eyebrow">
          {isBuyerRegistration ? 'Đăng ký người bán' : 'Hồ sơ gian hàng'}
        </span>
        <h1 id="seller-shop-title">
          {shop ? shop.name : isBuyerRegistration ? 'Thông tin đăng ký shop' : 'Đăng ký gian hàng'}
        </h1>
        {isBuyerRegistration ? (
          <ol className="buyer-shop-registration-steps" aria-label="Các bước đăng ký shop">
            <li className={!shop ? 'is-current' : undefined}>Điền hồ sơ</li>
            <li className={shop && !shop.canSell ? 'is-current' : undefined}>Chờ xét duyệt</li>
            <li className={shop?.canSell ? 'is-current' : undefined}>Mở Seller Center</li>
          </ol>
        ) : null}
        {shop ? (
          <p>
            Trạng thái duyệt: {onboardingLabel(shop.onboardingStatus)}. Vận hành:{' '}
            {statusLabel(shop.status)}.
            {shop.canSell
              ? ' Shop đủ điều kiện bán.'
              : ' Shop hiện không được bán trên catalog, storefront và checkout.'}
          </p>
        ) : (
          <p>
            Điền danh tính, liên hệ và địa chỉ lấy/trả hàng. Shop mới sẽ ở trạng thái chờ duyệt.
          </p>
        )}
        {shop?.onboardingReason && shop.onboardingStatus === 'rejected' ? (
          <p role="status">Lý do từ chối: {shop.onboardingReason}</p>
        ) : null}
      </div>
      {shop && mode === 'view' ? (
        <form
          className="seller-shop-profile-view seller-shop-profile-form"
          data-testid="seller-shop-profile-view"
          onSubmit={requestSubmit}
        >
          <div className="seller-shop-profile-layout">
            <aside className="seller-shop-preview-card">
              <div className="seller-shop-preview-card__banner">
                {shop.bannerUrl ? (
                  <img src={shop.bannerUrl} alt={`Banner ${shop.name}`} />
                ) : (
                  <span aria-hidden="true" />
                )}
              </div>
              <div className="seller-shop-preview-card__body">
                <div className="seller-shop-preview-card__logo">
                  {shop.logoUrl ? (
                    <img src={shop.logoUrl} alt={`Logo ${shop.name}`} />
                  ) : (
                    <span>{shop.name.slice(0, 1).toUpperCase()}</span>
                  )}
                </div>
                <strong className="seller-shop-preview-card__name">{shop.name}</strong>
                <p>{shop.location || 'Chưa cập nhật khu vực'}</p>
                <span
                  className={`seller-shop-status-badge seller-shop-status-badge--${shop.status}`}
                >
                  <i aria-hidden="true" /> {statusLabel(shop.status)}
                </span>
                <div className="seller-shop-preview-card__stats" aria-label="Tổng quan shop">
                  <div>
                    <strong>—</strong>
                    <span>Sản phẩm</span>
                  </div>
                  <div>
                    <strong>—</strong>
                    <span>Đánh giá</span>
                  </div>
                  <div>
                    <strong>—</strong>
                    <span>Theo dõi</span>
                  </div>
                </div>
                <Link className="seller-shop-preview-card__link" href={`/shops/${shop.slug}`}>
                  Xem trang cửa hàng
                </Link>
              </div>
            </aside>

            <div className="seller-shop-profile-sections">
              <section className="seller-shop-info-card">
                <div className="seller-shop-info-card__heading">
                  <div>
                    <h2>Thông tin cửa hàng</h2>
                    <p>Thông tin này sẽ hiển thị công khai với khách hàng.</p>
                  </div>
                  <div
                    className="seller-shop-profile-completion"
                    aria-label="Mức độ hoàn thiện hồ sơ"
                  >
                    <span>
                      <i /> <i /> <i /> <i /> <i className="is-muted" />
                    </span>
                    <strong>85%</strong>
                  </div>
                </div>
                <div className="seller-shop-profile-fields">
                  <div>
                    <span>Tên cửa hàng</span>
                    <input
                      name="name"
                      aria-label="Tên cửa hàng"
                      value={form.name}
                      onChange={(event) => setForm({ ...form, name: event.target.value })}
                      required
                    />
                  </div>
                  <div className="seller-shop-profile-field--wide seller-shop-profile-location">
                    <span>Khu vực</span>
                    <div className="seller-shop-profile-location__fields">
                      <LegacyAdministrativeDivisionFields
                        idPrefix="shop-profile"
                        dialogClassName="seller-shop-profile-division-dialog"
                        initialProvince={form.pickupAddress.province}
                        initialDistrict={form.pickupAddress.district}
                        initialWard={form.pickupAddress.ward}
                        disabled={pending}
                        onChange={({ province, district, ward }) =>
                          setForm({
                            ...form,
                            location: province || form.location,
                            pickupAddress: {
                              ...form.pickupAddress,
                              province,
                              district,
                              ward,
                            },
                          })
                        }
                      />
                    </div>
                    <label className="seller-shop-profile-location__address">
                      <span>Địa chỉ cụ thể</span>
                      <input
                        name="pickupAddressLine"
                        aria-label="Địa chỉ cụ thể"
                        value={form.pickupAddress.addressLine}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            pickupAddress: {
                              ...form.pickupAddress,
                              addressLine: event.target.value,
                            },
                          })
                        }
                        required
                      />
                    </label>
                  </div>
                  <div className="seller-shop-profile-field--wide">
                    <span>Mô tả cửa hàng</span>
                    <textarea
                      name="description"
                      aria-label="Mô tả cửa hàng"
                      value={form.description}
                      onChange={(event) => setForm({ ...form, description: event.target.value })}
                      rows={2}
                    />
                  </div>
                  <div>
                    <span>Số điện thoại</span>
                    <input
                      name="contactPhone"
                      aria-label="Số điện thoại"
                      value={form.contactPhone}
                      onChange={(event) => setForm({ ...form, contactPhone: event.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <span>Email liên hệ</span>
                    <input
                      name="contactEmail"
                      aria-label="Email liên hệ"
                      type="email"
                      value={form.contactEmail}
                      onChange={(event) => setForm({ ...form, contactEmail: event.target.value })}
                      required
                    />
                  </div>
                  <div className="seller-shop-profile-field--wide seller-shop-profile-field--status">
                    <span>Trạng thái hoạt động</span>
                    {isBuyerRegistration || shop.onboardingStatus !== 'approved' ? (
                      <strong>{statusLabel(shop.status)}</strong>
                    ) : (
                      <button
                        className={`seller-shop-status-toggle${draftStatus === 'active' ? ' is-on' : ''}`}
                        type="button"
                        role="switch"
                        aria-checked={draftStatus === 'active'}
                        aria-label="Trạng thái hoạt động"
                        disabled={pending}
                        onClick={() =>
                          setDraftStatus((current) =>
                            current === 'active' ? 'inactive' : 'active',
                          )
                        }
                      >
                        <span className="seller-shop-status-toggle__thumb" aria-hidden="true" />
                        <span>{draftStatus === 'active' ? 'Đang hoạt động' : 'Tạm ngừng'}</span>
                      </button>
                    )}
                  </div>
                </div>
              </section>

              <section className="seller-shop-channels-card">
                <div className="seller-shop-info-card__heading">
                  <div>
                    <h2>Kênh liên hệ &amp; mạng xã hội</h2>
                  </div>
                </div>
                <div className="seller-shop-channel-list">
                  <div>
                    <span className="seller-shop-channel-icon" aria-hidden="true">
                      ◎
                    </span>
                    <span>
                      <small>Website</small>
                      <span className="seller-shop-channel-edit">
                        <span aria-hidden="true">shopee.vn/</span>
                        <input
                          name="slug"
                          aria-label="Website"
                          value={form.slug}
                          onChange={(event) => setForm({ ...form, slug: event.target.value })}
                          required
                        />
                      </span>
                    </span>
                  </div>
                  <div>
                    <span className="seller-shop-channel-icon" aria-hidden="true">
                      f
                    </span>
                    <span>
                      <small>Facebook</small>
                      <strong>Chưa cập nhật</strong>
                    </span>
                  </div>
                  <div>
                    <span className="seller-shop-channel-icon" aria-hidden="true">
                      ◎
                    </span>
                    <span>
                      <small>Instagram</small>
                      <strong>Chưa cập nhật</strong>
                    </span>
                  </div>
                </div>
              </section>
            </div>
          </div>
          <div className="seller-shop-profile-save-actions">
            <button className="seller-shop-submit" type="submit" disabled={pending}>
              {pending ? 'Đang lưu…' : 'Lưu hồ sơ'}
            </button>
          </div>
          {message ? <p role="status">{message}</p> : null}
        </form>
      ) : (
        <form className="seller-shop-form" onSubmit={requestSubmit}>
          <label>
            Đường dẫn
            <input
              name="slug"
              value={form.slug}
              onChange={(event) => setForm({ ...form, slug: event.target.value })}
              required
            />
          </label>
          <label>
            Tên shop
            <input
              name="name"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              required
            />
          </label>
          <label className="seller-shop-form-wide">
            Mô tả
            <textarea
              name="description"
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </label>
          <label>
            Điện thoại
            <input
              name="contactPhone"
              value={form.contactPhone}
              onChange={(event) => setForm({ ...form, contactPhone: event.target.value })}
              required
            />
          </label>
          <label>
            Email
            <input
              name="contactEmail"
              type="email"
              value={form.contactEmail}
              onChange={(event) => setForm({ ...form, contactEmail: event.target.value })}
              required
            />
          </label>
          <label>
            Khu vực
            <input
              name="location"
              value={form.location}
              onChange={(event) => setForm({ ...form, location: event.target.value })}
              required
            />
          </label>
          <label>
            Logo URL (HTTPS, không bắt buộc)
            <input
              name="logoUrl"
              type="url"
              value={form.logoUrl ?? ''}
              onChange={(event) => setForm({ ...form, logoUrl: event.target.value || null })}
            />
          </label>
          <label>
            Banner URL (HTTPS, không bắt buộc)
            <input
              name="bannerUrl"
              type="url"
              value={form.bannerUrl ?? ''}
              onChange={(event) => setForm({ ...form, bannerUrl: event.target.value || null })}
            />
          </label>
          <fieldset className="seller-shop-form-wide">
            <legend>Địa chỉ lấy hàng</legend>
            <label>
              Người nhận
              <input
                name="pickupRecipientName"
                value={form.pickupAddress.recipientName}
                onChange={(event) =>
                  setForm({
                    ...form,
                    pickupAddress: { ...form.pickupAddress, recipientName: event.target.value },
                  })
                }
                required
              />
            </label>
            <label>
              Số điện thoại
              <input
                name="pickupPhoneNumber"
                value={form.pickupAddress.phoneNumber}
                onChange={(event) =>
                  setForm({
                    ...form,
                    pickupAddress: { ...form.pickupAddress, phoneNumber: event.target.value },
                  })
                }
                required
              />
            </label>
            <LegacyAdministrativeDivisionFields
              idPrefix="pickup"
              initialProvince={form.pickupAddress.province}
              initialDistrict={form.pickupAddress.district}
              initialWard={form.pickupAddress.ward}
              disabled={pending}
              onChange={(address) =>
                setForm({ ...form, pickupAddress: { ...form.pickupAddress, ...address } })
              }
            />
            <label>
              Địa chỉ chi tiết
              <input
                name="pickupAddressLine"
                value={form.pickupAddress.addressLine}
                onChange={(event) =>
                  setForm({
                    ...form,
                    pickupAddress: { ...form.pickupAddress, addressLine: event.target.value },
                  })
                }
                required
              />
            </label>
          </fieldset>
          <fieldset className="seller-shop-form-wide">
            <legend>Địa chỉ trả hàng</legend>
            <label>
              Người nhận
              <input
                name="returnRecipientName"
                value={form.returnAddress.recipientName}
                onChange={(event) =>
                  setForm({
                    ...form,
                    returnAddress: { ...form.returnAddress, recipientName: event.target.value },
                  })
                }
                required
              />
            </label>
            <label>
              Số điện thoại
              <input
                name="returnPhoneNumber"
                value={form.returnAddress.phoneNumber}
                onChange={(event) =>
                  setForm({
                    ...form,
                    returnAddress: { ...form.returnAddress, phoneNumber: event.target.value },
                  })
                }
                required
              />
            </label>
            <LegacyAdministrativeDivisionFields
              idPrefix="return"
              initialProvince={form.returnAddress.province}
              initialDistrict={form.returnAddress.district}
              initialWard={form.returnAddress.ward}
              disabled={pending}
              onChange={(address) =>
                setForm({ ...form, returnAddress: { ...form.returnAddress, ...address } })
              }
            />
            <label>
              Địa chỉ chi tiết
              <input
                name="returnAddressLine"
                value={form.returnAddress.addressLine}
                onChange={(event) =>
                  setForm({
                    ...form,
                    returnAddress: { ...form.returnAddress, addressLine: event.target.value },
                  })
                }
                required
              />
            </label>
          </fieldset>
          {shop?.onboardingStatus !== 'approved' ? (
            <p>Chỉ shop đã duyệt mới có thể tự kích hoạt bán.</p>
          ) : null}
          <div className="seller-shop-form-actions">
            <button className="seller-shop-submit" type="submit" disabled={pending}>
              {shop?.onboardingStatus === 'rejected'
                ? 'Sửa và gửi lại đăng ký'
                : shop
                  ? 'Lưu hồ sơ'
                  : 'Gửi đăng ký'}
            </button>
          </div>
          {message ? <p role="status">{message}</p> : null}
        </form>
      )}
      {confirmOpen ? (
        <div
          className="seller-shop-confirm-overlay"
          role="presentation"
          onMouseDown={() => setConfirmOpen(false)}
        >
          <div
            className="seller-shop-confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="seller-shop-confirm-title"
            aria-describedby="seller-shop-confirm-description"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2 id="seller-shop-confirm-title">Xác nhận thay đổi</h2>
            <p id="seller-shop-confirm-description">
              Bạn có chắc chắn muốn thay đổi thông tin hồ sơ shop không?
            </p>
            <div className="seller-shop-confirm-actions">
              <button
                className="seller-shop-status-action"
                type="button"
                onClick={() => setConfirmOpen(false)}
              >
                Hủy
              </button>
              <button
                className="seller-shop-submit"
                type="button"
                disabled={pending}
                onClick={() => void confirmSubmit()}
              >
                Xác nhận thay đổi
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
