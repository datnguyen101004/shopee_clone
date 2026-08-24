'use client';

import type { ShippingAddress } from '@shopee-clone/contracts';
import { Dialog, DialogContent } from '@shopee-clone/ui';
import { useState, type FormEvent } from 'react';

import { createShippingAddress } from '../lib/account-api';
import { useAuthSession } from './auth-session-provider';
import {
  AddressForm,
  addressPayload,
  type AddressErrors,
} from './address-management';

export function AddressCreationDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (address: ShippingAddress) => void;
}) {
  const auth = useAuthSession();
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<AddressErrors>({});
  const [message, setMessage] = useState('');

  function close(nextOpen: boolean) {
    if (!nextOpen && pending) return;
    if (!nextOpen) {
      setErrors({});
      setMessage('');
    }
    onOpenChange(nextOpen);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || auth.state.status !== 'authenticated') return;
    const parsed = addressPayload(new FormData(event.currentTarget));
    if (Object.keys(parsed.errors).length > 0) {
      setErrors(parsed.errors);
      setMessage('Vui lòng kiểm tra các trường địa chỉ được đánh dấu.');
      return;
    }
    setErrors({});
    setMessage('');
    setPending(true);
    try {
      const address = await createShippingAddress(parsed.value, auth.authenticatedFetch);
      onCreated?.(address);
      close(false);
    } catch {
      setMessage('Chưa thể lưu địa chỉ. Vui lòng kiểm tra thông tin và thử lại.');
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        className="buyer-address-dialog"
        title="Thêm địa chỉ nhận hàng"
        description="Nhập địa chỉ để tiếp tục xem giá và phí vận chuyển."
        preventOutsideClose={pending}
      >
        {message ? (
          <p className="buyer-address-dialog__message" role="alert">
            {message}
          </p>
        ) : null}
        <AddressForm
          initial={null}
          pending={pending}
          errors={errors}
          onSubmit={submit}
          onCancel={() => close(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
