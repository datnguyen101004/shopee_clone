import { RegisterForm } from '../../../components/account-forms';
import { AccountPage } from '../../../components/account-page';

export default function RegisterPage() {
  return (
    <AccountPage
      eyebrow="BẮT ĐẦU MUA SẮM"
      title="Tạo tài khoản"
      description="Dùng email của bạn để tạo tài khoản người mua an toàn."
    >
      <RegisterForm />
    </AccountPage>
  );
}
