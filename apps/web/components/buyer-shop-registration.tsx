'use client';

import { AccountWorkspace } from './protected-account-state';
import { SellerShopManagement } from './seller-shop-management';

export function BuyerShopRegistration() {
  return (
    <AccountWorkspace
      title="Đăng ký thành shop"
      description="Tạo hồ sơ shop, theo dõi xét duyệt và bổ sung thông tin ngay trong tài khoản người mua."
    >
      <SellerShopManagement surface="buyer-registration" />
    </AccountWorkspace>
  );
}
