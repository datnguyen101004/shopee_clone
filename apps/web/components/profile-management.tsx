'use client';

import {
  ACCOUNT_NAME_MAX_LENGTH,
  ACCOUNT_NAME_MIN_LENGTH,
  normalizeAccountText,
  normalizeVietnamesePhone,
  type BuyerProfile,
} from '@shopee-clone/contracts';
import { Button, Card, InputField } from '@shopee-clone/ui';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

import { getBuyerProfile, updateBuyerProfile } from '../lib/account-api';
import { useAuthSession } from './auth-session-provider';
import {
  AccountLoadFailure,
  AccountWorkspace,
  ProtectedAccountState,
} from './protected-account-state';

type FieldErrors = { displayName?: string; phoneNumber?: string };

export function ProfileManagement() {
  const auth = useAuthSession();
  const [profile, setProfile] = useState<BuyerProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const errorReference = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (auth.state.status !== 'authenticated') return;
    setLoading(true);
    setLoadFailed(false);
    try {
      setProfile(await getBuyerProfile(auth.authenticatedFetch));
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [auth.authenticatedFetch, auth.state.status]);

  useEffect(() => {
    queueMicrotask(() => {
      if (auth.state.status === 'authenticated') void load();
      else setProfile(null);
    });
  }, [auth.state.status, load]);

  useEffect(() => {
    if (message && errors.displayName === undefined && errors.phoneNumber === undefined) {
      errorReference.current?.focus();
    }
  }, [errors, message]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !profile) return;
    const form = new FormData(event.currentTarget);
    const submittedName = String(form.get('displayName') ?? '');
    const submittedPhone = String(form.get('phoneNumber') ?? '');
    const displayName = normalizeAccountText(
      submittedName,
      ACCOUNT_NAME_MIN_LENGTH,
      ACCOUNT_NAME_MAX_LENGTH,
    );
    const phoneNumber = submittedPhone.trim() ? normalizeVietnamesePhone(submittedPhone) : null;
    const nextErrors: FieldErrors = {};
    if (!displayName) nextErrors.displayName = 'Tên hiển thị phải có từ 2 đến 120 ký tự.';
    if (submittedPhone.trim() && !phoneNumber) {
      nextErrors.phoneNumber = 'Dùng số Việt Nam gồm 10 chữ số, bắt đầu bằng 0 hoặc +84.';
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setMessage('Vui lòng kiểm tra các trường được đánh dấu.');
      return;
    }
    setPending(true);
    setErrors({});
    setMessage('');
    try {
      const updated = await updateBuyerProfile(
        { displayName: displayName!, phoneNumber },
        auth.authenticatedFetch,
      );
      setProfile(updated);
      auth.synchronizeDisplayName(updated.displayName);
      setMessage('Đã lưu hồ sơ của bạn.');
    } catch {
      setMessage('Chưa thể lưu hồ sơ. Vui lòng thử lại.');
    } finally {
      setPending(false);
    }
  }

  return (
    <AccountWorkspace
      title="Hồ sơ cá nhân"
      description="Cập nhật tên hiển thị và số điện thoại dùng cho tài khoản mua hàng."
    >
      <ProtectedAccountState account={auth.state} returnTo="/account/profile">
        {loading && !profile ? (
          <section className="buyer-account-state" aria-busy="true">
            <h2>Đang tải hồ sơ…</h2>
          </section>
        ) : loadFailed && !profile ? (
          <AccountLoadFailure onRetry={() => void load()} />
        ) : profile ? (
          <Card className="buyer-account-card">
            <form className="buyer-account-form" noValidate onSubmit={submit} aria-busy={pending}>
              <div className="buyer-account-readonly">
                <div>
                  <span>Email</span>
                  <strong>{profile.email}</strong>
                </div>
                <div>
                  <span>Trạng thái</span>
                  <strong>{profile.status === 'active' ? 'Đang hoạt động' : 'Tạm ngưng'}</strong>
                </div>
              </div>
              <InputField
                id="profile-display-name"
                name="displayName"
                label="Tên hiển thị"
                defaultValue={profile.displayName}
                minLength={ACCOUNT_NAME_MIN_LENGTH}
                maxLength={ACCOUNT_NAME_MAX_LENGTH}
                autoComplete="name"
                error={errors.displayName}
                required
              />
              <InputField
                id="profile-phone-number"
                name="phoneNumber"
                label="Số điện thoại"
                defaultValue={profile.phoneNumber ?? ''}
                autoComplete="tel"
                inputMode="tel"
                hint="Ví dụ: 0912 345 678 hoặc +84 912 345 678."
                error={errors.phoneNumber}
                optional
              />
              {message ? (
                <div
                  ref={errorReference}
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
              <Button type="submit" loading={pending} disabled={pending}>
                Lưu thay đổi
              </Button>
            </form>
          </Card>
        ) : null}
      </ProtectedAccountState>
    </AccountWorkspace>
  );
}
