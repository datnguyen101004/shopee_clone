'use client';

import {
  ACCOUNT_ADDRESS_LABEL_MAX_LENGTH,
  ACCOUNT_ADDRESS_LABEL_MIN_LENGTH,
  ACCOUNT_ADDRESS_LINE_MAX_LENGTH,
  ACCOUNT_ADDRESS_LINE_MIN_LENGTH,
  ACCOUNT_AREA_MAX_LENGTH,
  ACCOUNT_AREA_MIN_LENGTH,
  ACCOUNT_NAME_MAX_LENGTH,
  ACCOUNT_NAME_MIN_LENGTH,
  normalizeAccountText,
  normalizeVietnamesePhone,
  type CreateShippingAddressRequest,
  type ShippingAddress,
} from '@shopee-clone/contracts';
import {
  Button,
  Card,
  CheckboxField,
  Dialog,
  DialogClose,
  DialogContent,
  InputField,
  TextareaField,
} from '@shopee-clone/ui';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

import {
  createShippingAddress,
  deleteShippingAddress,
  getShippingAddresses,
  selectDefaultShippingAddress,
  updateShippingAddress,
} from '../lib/account-api';
import { useAuthSession } from './auth-session-provider';
import {
  AccountLoadFailure,
  AccountWorkspace,
  ProtectedAccountState,
} from './protected-account-state';
import { LegacyAdministrativeDivisionFields } from './legacy-administrative-division-fields';

type AddressField = keyof Omit<CreateShippingAddressRequest, 'isDefault'>;
export type AddressErrors = Partial<Record<AddressField, string>>;

function normalizeField(
  form: FormData,
  name: AddressField,
  minimum: number,
  maximum: number,
  errors: AddressErrors,
): string {
  const value = String(form.get(name) ?? '');
  const normalized = normalizeAccountText(value, minimum, maximum);
  if (!normalized) errors[name] = 'Vui lòng nhập nội dung hợp lệ trong giới hạn cho phép.';
  return normalized ?? value.trim();
}

export function addressPayload(form: FormData): {
  value: CreateShippingAddressRequest;
  errors: AddressErrors;
} {
  const errors: AddressErrors = {};
  const rawPhone = String(form.get('phoneNumber') ?? '');
  const phoneNumber = normalizeVietnamesePhone(rawPhone);
  if (!phoneNumber) errors.phoneNumber = 'Dùng số Việt Nam gồm 10 chữ số, bắt đầu bằng 0 hoặc +84.';
  const rawLabel = String(form.get('label') ?? '');
  const label = rawLabel.trim()
    ? normalizeAccountText(
        rawLabel,
        ACCOUNT_ADDRESS_LABEL_MIN_LENGTH,
        ACCOUNT_ADDRESS_LABEL_MAX_LENGTH,
      )
    : null;
  if (rawLabel.trim() && !label) errors.label = 'Nhãn địa chỉ tối đa 50 ký tự.';
  return {
    value: {
      recipientName: normalizeField(
        form,
        'recipientName',
        ACCOUNT_NAME_MIN_LENGTH,
        ACCOUNT_NAME_MAX_LENGTH,
        errors,
      ),
      phoneNumber: phoneNumber ?? rawPhone,
      province: normalizeField(
        form,
        'province',
        ACCOUNT_AREA_MIN_LENGTH,
        ACCOUNT_AREA_MAX_LENGTH,
        errors,
      ),
      district: normalizeField(
        form,
        'district',
        ACCOUNT_AREA_MIN_LENGTH,
        ACCOUNT_AREA_MAX_LENGTH,
        errors,
      ),
      ward: normalizeField(form, 'ward', ACCOUNT_AREA_MIN_LENGTH, ACCOUNT_AREA_MAX_LENGTH, errors),
      addressLine: normalizeField(
        form,
        'addressLine',
        ACCOUNT_ADDRESS_LINE_MIN_LENGTH,
        ACCOUNT_ADDRESS_LINE_MAX_LENGTH,
        errors,
      ),
      label,
      isDefault: form.get('isDefault') === 'on',
    },
    errors,
  };
}

export function AddressForm({
  initial,
  pending,
  errors,
  onSubmit,
  onCancel,
}: {
  initial: ShippingAddress | null;
  pending: boolean;
  errors: AddressErrors;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <Card className="buyer-address-form-card">
      <h2 ref={heading} tabIndex={-1}>
        {initial ? 'Chỉnh sửa địa chỉ' : 'Thêm địa chỉ mới'}
      </h2>
      <form className="buyer-address-form" noValidate onSubmit={onSubmit} aria-busy={pending}>
        <InputField
          id="address-recipient-name"
          name="recipientName"
          label="Họ và tên người nhận"
          defaultValue={initial?.recipientName ?? ''}
          autoComplete="name"
          maxLength={ACCOUNT_NAME_MAX_LENGTH}
          error={errors.recipientName}
          required
        />
        <InputField
          id="address-phone-number"
          name="phoneNumber"
          label="Số điện thoại"
          defaultValue={initial?.phoneNumber ?? ''}
          autoComplete="tel"
          inputMode="tel"
          hint="Ví dụ: 0912 345 678 hoặc +84 912 345 678."
          error={errors.phoneNumber}
          required
        />
        <div className="buyer-address-form__areas">
          <LegacyAdministrativeDivisionFields
            initialProvince={initial?.province}
            initialDistrict={initial?.district}
            initialWard={initial?.ward}
            provinceError={errors.province}
            districtError={errors.district}
            wardError={errors.ward}
            disabled={pending}
          />
        </div>
        <TextareaField
          id="address-line"
          name="addressLine"
          label="Địa chỉ cụ thể"
          defaultValue={initial?.addressLine ?? ''}
          autoComplete="street-address"
          rows={3}
          maxLength={ACCOUNT_ADDRESS_LINE_MAX_LENGTH}
          error={errors.addressLine}
          required
        />
        <InputField
          id="address-label"
          name="label"
          label="Loại địa chỉ"
          defaultValue={initial?.label ?? ''}
          placeholder="Nhà riêng, Văn phòng…"
          maxLength={ACCOUNT_ADDRESS_LABEL_MAX_LENGTH}
          error={errors.label}
          optional
        />
        {!initial ? (
          <CheckboxField
            id="address-is-default"
            name="isDefault"
            label="Đặt làm địa chỉ mặc định"
            description="Địa chỉ đầu tiên luôn được chọn làm mặc định."
          />
        ) : null}
        <div className="buyer-address-form__actions">
          <Button type="submit" loading={pending} disabled={pending}>
            {initial ? 'Lưu địa chỉ' : 'Thêm địa chỉ'}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
            Hủy
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function AddressManagement() {
  const auth = useAuthSession();
  const [addresses, setAddresses] = useState<ShippingAddress[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [editing, setEditing] = useState<ShippingAddress | null | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<ShippingAddress | null>(null);
  const [pendingAction, setPendingAction] = useState('');
  const [errors, setErrors] = useState<AddressErrors>({});
  const [message, setMessage] = useState('');
  const messageReference = useRef<HTMLDivElement>(null);
  const addButtonReference = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    if (auth.state.status !== 'authenticated') return;
    setLoading(true);
    setLoadFailed(false);
    try {
      setAddresses((await getShippingAddresses(auth.authenticatedFetch)).items);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [auth.authenticatedFetch, auth.state.status]);

  useEffect(() => {
    queueMicrotask(() => {
      if (auth.state.status === 'authenticated') void load();
      else setAddresses(null);
    });
  }, [auth.state.status, load]);

  useEffect(() => {
    if (message) messageReference.current?.focus();
  }, [message]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingAction) return;
    const parsed = addressPayload(new FormData(event.currentTarget));
    if (Object.keys(parsed.errors).length > 0) {
      setErrors(parsed.errors);
      setMessage('Vui lòng kiểm tra các trường địa chỉ được đánh dấu.');
      return;
    }
    setErrors({});
    setMessage('');
    setPendingAction('save');
    try {
      if (editing) {
        const mutable = {
          recipientName: parsed.value.recipientName,
          phoneNumber: parsed.value.phoneNumber,
          province: parsed.value.province,
          district: parsed.value.district,
          ward: parsed.value.ward,
          addressLine: parsed.value.addressLine,
          label: parsed.value.label,
        };
        await updateShippingAddress(editing.id, mutable, auth.authenticatedFetch);
      } else {
        await createShippingAddress(parsed.value, auth.authenticatedFetch);
      }
      await load();
      setEditing(undefined);
      setMessage(editing ? 'Đã cập nhật địa chỉ.' : 'Đã thêm địa chỉ mới.');
      requestAnimationFrame(() => addButtonReference.current?.focus());
    } catch {
      setMessage('Chưa thể lưu địa chỉ. Vui lòng kiểm tra thông tin và thử lại.');
    } finally {
      setPendingAction('');
    }
  }

  async function makeDefault(address: ShippingAddress) {
    if (pendingAction || address.isDefault) return;
    setPendingAction(`default:${address.id}`);
    setMessage('');
    try {
      await selectDefaultShippingAddress(address.id, auth.authenticatedFetch);
      await load();
      setMessage('Đã thay đổi địa chỉ mặc định.');
    } catch {
      setMessage('Chưa thể thay đổi địa chỉ mặc định. Vui lòng thử lại.');
    } finally {
      setPendingAction('');
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || pendingAction) return;
    setPendingAction(`delete:${deleteTarget.id}`);
    setMessage('');
    try {
      await deleteShippingAddress(deleteTarget.id, auth.authenticatedFetch);
      setDeleteTarget(null);
      await load();
      setMessage('Đã xóa địa chỉ.');
      requestAnimationFrame(() => addButtonReference.current?.focus());
    } catch {
      setMessage('Chưa thể xóa địa chỉ. Vui lòng thử lại.');
    } finally {
      setPendingAction('');
    }
  }

  return (
    <AccountWorkspace
      title="Địa chỉ nhận hàng"
      description="Quản lý địa chỉ giao hàng tại Việt Nam và chọn một địa chỉ mặc định."
    >
      <ProtectedAccountState account={auth.state} returnTo="/account/addresses">
        {message ? (
          <div
            ref={messageReference}
            className={
              message.startsWith('Đã')
                ? 'buyer-account-message is-success'
                : 'buyer-account-message is-error'
            }
            role={message.startsWith('Đã') ? 'status' : 'alert'}
            tabIndex={-1}
          >
            {message}
          </div>
        ) : null}
        <div className="buyer-address-toolbar">
          <div>
            <h2>Địa chỉ của bạn</h2>
            <span>{addresses?.length ?? 0} địa chỉ đang hoạt động</span>
          </div>
          <Button
            ref={addButtonReference}
            type="button"
            onClick={() => {
              setEditing(null);
              setErrors({});
              setMessage('');
            }}
            disabled={Boolean(pendingAction)}
          >
            Thêm địa chỉ
          </Button>
        </div>
        {editing !== undefined ? (
          <AddressForm
            key={editing?.id ?? 'new'}
            initial={editing}
            pending={pendingAction === 'save'}
            errors={errors}
            onSubmit={submit}
            onCancel={() => {
              setEditing(undefined);
              setErrors({});
              setMessage('');
              requestAnimationFrame(() => addButtonReference.current?.focus());
            }}
          />
        ) : null}
        {loading && addresses === null ? (
          <section className="buyer-account-state" aria-busy="true">
            <h2>Đang tải danh sách địa chỉ…</h2>
          </section>
        ) : loadFailed && addresses === null ? (
          <AccountLoadFailure onRetry={() => void load()} />
        ) : addresses?.length === 0 ? (
          <section className="buyer-account-state">
            <h2>Bạn chưa có địa chỉ nhận hàng</h2>
            <p>Thêm địa chỉ đầu tiên; hệ thống sẽ tự đặt địa chỉ đó làm mặc định.</p>
          </section>
        ) : (
          <div className="buyer-address-list" aria-live="polite">
            {addresses?.map((address) => (
              <Card className="buyer-address-card" key={address.id}>
                <div className="buyer-address-card__heading">
                  <div>
                    <strong>{address.recipientName}</strong>
                    <span>{address.phoneNumber}</span>
                  </div>
                  {address.isDefault ? <b>Địa chỉ mặc định</b> : null}
                </div>
                <p>
                  {address.addressLine}, {address.ward}, {address.district}, {address.province}
                </p>
                {address.label ? <small>{address.label}</small> : null}
                <div className="buyer-address-card__actions">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditing(address);
                      setErrors({});
                      setMessage('');
                    }}
                    disabled={Boolean(pendingAction)}
                  >
                    Sửa
                  </Button>
                  {!address.isDefault ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      loading={pendingAction === `default:${address.id}`}
                      onClick={() => void makeDefault(address)}
                      disabled={Boolean(pendingAction)}
                    >
                      Đặt làm mặc định
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => setDeleteTarget(address)}
                    disabled={Boolean(pendingAction)}
                  >
                    Xóa
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
        <Dialog
          open={deleteTarget !== null}
          onOpenChange={(open) => {
            if (!open && !pendingAction) setDeleteTarget(null);
          }}
        >
          <DialogContent
            title="Xóa địa chỉ này?"
            description="Nếu đây là địa chỉ mặc định, hệ thống sẽ tự chọn địa chỉ cũ nhất còn lại."
            preventOutsideClose={Boolean(pendingAction)}
          >
            <div className="buyer-address-delete-actions">
              <Button
                type="button"
                variant="destructive"
                loading={pendingAction.startsWith('delete:')}
                onClick={() => void confirmDelete()}
              >
                Xác nhận xóa
              </Button>
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={Boolean(pendingAction)}>
                  Giữ lại địa chỉ
                </Button>
              </DialogClose>
            </div>
          </DialogContent>
        </Dialog>
      </ProtectedAccountState>
    </AccountWorkspace>
  );
}
