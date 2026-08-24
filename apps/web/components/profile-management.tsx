'use client';

import {
  ACCOUNT_NAME_MAX_LENGTH,
  ACCOUNT_NAME_MIN_LENGTH,
  normalizeAccountText,
  normalizeVietnamesePhone,
  type BuyerProfile,
} from '@shopee-clone/contracts';
import { Button, InputField } from '@shopee-clone/ui';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

import { getBuyerProfile, updateBuyerProfile } from '../lib/account-api';
import { useAuthSession } from './auth-session-provider';
import {
  AccountLoadFailure,
  AccountWorkspace,
  ProtectedAccountState,
} from './protected-account-state';

// Font Awesome SVG Icons
function FaUser({ className }: { className?: string }) {
  return (
    <svg className={className} width="48" height="48" viewBox="0 0 448 512" fill="currentColor" aria-hidden="true">
      <path d="M224 256A128 128 0 1 0 224 0a128 128 0 1 0 0 256zm-45.7 48C79.8 304 0 383.8 0 482.3C0 498.7 13.3 512 29.7 512l388.6 0c16.4 0 29.7-13.3 29.7-29.7C448 383.8 368.2 304 269.7 304l-91.4 0z" />
    </svg>
  );
}

function FaCheckCircle({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 512 512" fill="currentColor" aria-hidden="true">
      <path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM369 209L241 337c-9.4 9.4-24.6 9.4-33.9 0l-64-64c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l47 47L335 175c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9z" />
    </svg>
  );
}

function FaExclamationCircle({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 512 512" fill="currentColor" aria-hidden="true">
      <path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zm0-384c13.3 0 24 10.7 24 24l0 112c0 13.3-10.7 24-24 24s-24-10.7-24-24l0-112c0-13.3 10.7-24 24-24zm32 224a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z" />
    </svg>
  );
}

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

  // Decorative UI state for gender and birth date (Shopee profile standard)
  const [gender, setGender] = useState<'male' | 'female' | 'other'>('male');
  const [birthDay, setBirthDay] = useState('10');
  const [birthMonth, setBirthMonth] = useState('10');
  const [birthYear, setBirthYear] = useState('2004');

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
          <div className="shopee-profile-card">
            {/* Header section */}
            <header className="shopee-profile-head">
              <h1 className="shopee-profile-head__title">Hồ sơ cá nhân</h1>
              <p className="shopee-profile-head__subtitle">Quản lý thông tin hồ sơ để bảo mật tài khoản</p>
            </header>
            <hr className="shopee-profile-divider" />

            {/* Body: Form + Avatar Split */}
            <div className="shopee-profile-body">
              {/* Left Column: Form Details */}
              <form className="shopee-profile-form" noValidate onSubmit={submit} aria-busy={pending}>
                {/* Row: Tên đăng nhập / Email */}
                <div className="shopee-form-row">
                  <span className="shopee-form-row__label">Tên đăng nhập</span>
                  <div className="shopee-form-row__value">
                    <span className="shopee-form-text">{profile.email.split('@')[0]}</span>
                  </div>
                </div>

                {/* Row: Tên hiển thị */}
                <div className="shopee-form-row">
                  <span className="shopee-form-row__label">
                    Tên hiển thị <span className="shopee-required" aria-hidden="true">*</span>
                  </span>
                  <div className="shopee-form-row__value">
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
                  </div>
                </div>

                {/* Row: Email */}
                <div className="shopee-form-row">
                  <span className="shopee-form-row__label">Email</span>
                  <div className="shopee-form-row__value">
                    <span className="shopee-form-text">{profile.email}</span>
                  </div>
                </div>

                {/* Row: Số điện thoại */}
                <div className="shopee-form-row">
                  <span className="shopee-form-row__label">
                    Số điện thoại
                  </span>
                  <div className="shopee-form-row__value">
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
                  </div>
                </div>

                {/* Row: Trạng thái tài khoản */}
                <div className="shopee-form-row">
                  <span className="shopee-form-row__label">Trạng thái</span>
                  <div className="shopee-form-row__value">
                    <span className={`shopee-status-badge ${profile.status === 'active' ? 'is-active' : 'is-suspended'}`}>
                      <FaCheckCircle />
                      <strong>{profile.status === 'active' ? 'Đang hoạt động' : 'Tạm ngưng'}</strong>
                    </span>
                  </div>
                </div>

                {/* Row: Giới tính */}
                <div className="shopee-form-row">
                  <span className="shopee-form-row__label">Giới tính</span>
                  <div className="shopee-form-row__value">
                    <div className="shopee-radio-group">
                      <label className="shopee-radio-label">
                        <input
                          type="radio"
                          name="gender"
                          value="male"
                          checked={gender === 'male'}
                          onChange={() => setGender('male')}
                        />
                        <span>Nam</span>
                      </label>
                      <label className="shopee-radio-label">
                        <input
                          type="radio"
                          name="gender"
                          value="female"
                          checked={gender === 'female'}
                          onChange={() => setGender('female')}
                        />
                        <span>Nữ</span>
                      </label>
                      <label className="shopee-radio-label">
                        <input
                          type="radio"
                          name="gender"
                          value="other"
                          checked={gender === 'other'}
                          onChange={() => setGender('other')}
                        />
                        <span>Khác</span>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Row: Ngày sinh */}
                <div className="shopee-form-row">
                  <span className="shopee-form-row__label">Ngày sinh</span>
                  <div className="shopee-form-row__value">
                    <div className="shopee-birthdate-group">
                      <select
                        aria-label="Ngày sinh"
                        value={birthDay}
                        onChange={(e) => setBirthDay(e.target.value)}
                        className="shopee-select"
                      >
                        {Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0')).map((d) => (
                          <option key={d} value={d}>Ngày {d}</option>
                        ))}
                      </select>
                      <select
                        aria-label="Tháng sinh"
                        value={birthMonth}
                        onChange={(e) => setBirthMonth(e.target.value)}
                        className="shopee-select"
                      >
                        {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map((m) => (
                          <option key={m} value={m}>Tháng {m}</option>
                        ))}
                      </select>
                      <select
                        aria-label="Năm sinh"
                        value={birthYear}
                        onChange={(e) => setBirthYear(e.target.value)}
                        className="shopee-select"
                      >
                        {Array.from({ length: 80 }, (_, i) => String(2024 - i)).map((y) => (
                          <option key={y} value={y}>{y}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Status / Error Message */}
                {message ? (
                  <div
                    ref={errorReference}
                    className={`shopee-form-alert ${message.startsWith('Đã') ? 'is-success' : 'is-error'}`}
                    role={message.startsWith('Đã') ? 'status' : 'alert'}
                    tabIndex={-1}
                  >
                    {message.startsWith('Đã') ? <FaCheckCircle /> : <FaExclamationCircle />}
                    <span>{message}</span>
                  </div>
                ) : null}

                {/* Submit button */}
                <div className="shopee-form-row shopee-form-row--submit">
                  <div className="shopee-form-row__label" />
                  <div className="shopee-form-row__value">
                    <Button type="submit" className="shopee-btn-save" loading={pending} disabled={pending}>
                      Lưu thay đổi
                    </Button>
                  </div>
                </div>
              </form>

              {/* Right Column: Avatar Upload Preview */}
              <div className="shopee-profile-avatar">
                <div className="shopee-avatar-preview" aria-hidden="true">
                  <FaUser className="shopee-avatar-icon" />
                </div>
                <button type="button" className="shopee-btn-avatar">
                  Chọn Ảnh
                </button>
                <div className="shopee-avatar-hint">
                  <p>Dụng lượng file tối đa 1 MB</p>
                  <p>Định dạng: .JPEG, .PNG</p>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </ProtectedAccountState>
    </AccountWorkspace>
  );
}
