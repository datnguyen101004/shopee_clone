'use client';

import {
  isCreateSellerShopRequest,
  type CreateSellerShopRequest,
  type SellerShopProfile,
  type ShopServiceAddress,
} from '@shopee-clone/contracts';
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

function fromProfile(shop: SellerShopProfile): CreateSellerShopRequest {
  return fromWorkspaceShop(shop, null);
}

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

export function SellerShopManagement() {
  const { authenticatedFetch, state: authState } = useAuthSession();
  const [shop, setShop] = useState<SellerShopProfile | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (authState.status !== 'authenticated') return;
    let active = true;
    void fetchSellerShopWorkspace(authenticatedFetch)
      .then((workspace) => {
        if (!active) return;
        setShop(workspace.shop);
        setForm(
          workspace.shop
            ? fromWorkspaceShop(workspace.shop, workspace.defaultAddress)
            : newShopForm(workspace.defaultAddress),
        );
        setStatus('ready');
      })
      .catch(() => {
        if (active) setStatus('error');
      });
    return () => {
      active = false;
    };
  }, [authState.status, authenticatedFetch]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    const payload: CreateSellerShopRequest = {
      ...form,
      logoUrl: form.logoUrl?.trim() ? form.logoUrl.trim() : null,
      bannerUrl: form.bannerUrl?.trim() ? form.bannerUrl.trim() : null,
    };
    const incompleteMessage = incompleteProfileMessage(payload);
    if (incompleteMessage) {
      setMessage(incompleteMessage);
      return;
    }
    if (!isCreateSellerShopRequest(payload)) {
      setMessage(
        'Thông tin hồ sơ chưa hợp lệ. Kiểm tra lại slug, số điện thoại, email và địa chỉ chi tiết.',
      );
      return;
    }
    setPending(true);
    try {
      const next = shop
        ? shop.onboardingStatus === 'approved'
          ? await updateSellerShop(authenticatedFetch, payload)
          : await updateSellerRegistration(authenticatedFetch, payload)
        : await createSellerShop(authenticatedFetch, payload);
      setShop(next);
      setForm(fromProfile(next));
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
    return <section className="operational-panel" aria-busy="true"><h1>Đang kiểm tra phiên</h1></section>;
  }
  if (authState.status === 'guest') {
    return <section className="operational-panel"><h1>Cần đăng nhập</h1><a href="/login">Đăng nhập</a></section>;
  }
  if (!authState.user.roles.includes('buyer')) {
    return <section className="operational-panel" role="status"><h1>Không có quyền truy cập</h1></section>;
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
      className="operational-panel seller-shop-panel"
      aria-labelledby="seller-shop-form-title"
    >
      <span className="operational-eyebrow">Hồ sơ gian hàng</span>
      <h1 id="seller-shop-form-title">{shop ? shop.name : 'Đăng ký gian hàng'}</h1>
      {shop ? (
        <p>
          Trạng thái duyệt: {onboardingLabel(shop.onboardingStatus)}. Vận hành:{' '}
          {statusLabel(shop.status)}.
          {shop.canSell
            ? ' Shop đủ điều kiện bán.'
            : ' Shop hiện không được bán trên catalog, storefront và checkout.'}
        </p>
      ) : (
        <p>Điền danh tính, liên hệ và địa chỉ lấy/trả hàng. Shop mới sẽ ở trạng thái chờ duyệt.</p>
      )}
      {shop?.onboardingReason && shop.onboardingStatus === 'rejected' ? (
        <p role="status">Lý do từ chối: {shop.onboardingReason}</p>
      ) : null}
      <form className="seller-shop-form" onSubmit={(event) => void submit(event)}>
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
        {shop?.onboardingStatus === 'approved' ? (
          <fieldset className="seller-shop-form-wide">
            <legend>Trạng thái bán</legend>
            <button
              className="seller-shop-status-action"
              type="button"
              disabled={pending}
              onClick={() => {
                void updateSellerShop(authenticatedFetch, {
                  status: shop.status === 'active' ? 'inactive' : 'active',
                }).then((next) => {
                  setShop(next);
                  setForm(fromProfile(next));
                });
              }}
            >
              {shop.status === 'active' ? 'Tạm ngừng bán' : 'Mở bán'}
            </button>
          </fieldset>
        ) : (
          <p>Chỉ shop đã duyệt mới có thể tự kích hoạt bán.</p>
        )}
        <button className="seller-shop-submit" type="submit" disabled={pending}>
          {shop?.onboardingStatus === 'rejected' ? 'Sửa và gửi lại đăng ký' : shop ? 'Lưu hồ sơ' : 'Gửi đăng ký'}
        </button>
        {message ? <p role="status">{message}</p> : null}
      </form>
    </section>
  );
}
