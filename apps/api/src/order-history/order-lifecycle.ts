import type { ShopOrderStatus } from '@shopee-clone/contracts';

export const ORDER_TRANSITIONS: Readonly<Record<ShopOrderStatus, readonly ShopOrderStatus[]>> = {
  PENDING_CONFIRMATION: ['AWAITING_PICKUP', 'CANCELLED'],
  AWAITING_PICKUP: ['SHIPPING', 'CANCELLED'],
  SHIPPING: ['DELIVERED'],
  DELIVERED: ['RETURN_REQUESTED'],
  CANCELLED: [],
  RETURN_REQUESTED: ['DELIVERED', 'RETURNED', 'REFUNDED'],
  RETURNED: ['REFUNDED'],
  REFUNDED: [],
};

export function canTransitionOrder(current: ShopOrderStatus, target: ShopOrderStatus): boolean {
  return ORDER_TRANSITIONS[current].includes(target);
}
