import { ForgotPasswordForm } from '../../../components/account-forms';
import { AccountPage } from '../../../components/account-page';

export default function ForgotPasswordPage() {
  return (
    <AccountPage
      eyebrow="KHÔI PHỤC TÀI KHOẢN"
      title="Quên mật khẩu"
      description="Nhập email để nhận hướng dẫn nếu tài khoản đủ điều kiện."
    >
      <ForgotPasswordForm />
    </AccountPage>
  );
}
