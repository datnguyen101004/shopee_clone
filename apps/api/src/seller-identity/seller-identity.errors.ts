import { AdminError } from '../admin/admin.errors';

export class SellerShopInvariantError extends AdminError {
  constructor(message = 'Seller account and approved shop are not in a valid paired state') {
    super(message, 409, 'SELLER_SHOP_INVARIANT');
  }
}
