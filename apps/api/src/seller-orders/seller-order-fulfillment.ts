import type {
  SellerOrderAction,
  SellerOrderFulfillmentState,
  ShopOrderStatus,
} from '@shopee-clone/contracts';

export const SELLER_CONFIRMATION_DEADLINE_MS = 24 * 60 * 60 * 1000;
export const SELLER_HANDOFF_DEADLINE_MS = 48 * 60 * 60 * 1000;

export interface SellerOrderStateContext {
  orderStatus: ShopOrderStatus;
  fulfillmentState: SellerOrderFulfillmentState;
  shipmentExists: boolean;
}

const transitions: Readonly<
  Record<SellerOrderFulfillmentState, readonly SellerOrderFulfillmentState[]>
> = {
  PENDING_CONFIRMATION: ['CONFIRMED', 'REJECTED', 'CANCELLED'],
  CONFIRMED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY_FOR_PICKUP', 'CANCELLED'],
  READY_FOR_PICKUP: ['HANDED_OFF', 'CANCELLED'],
  HANDED_OFF: [],
  REJECTED: [],
  CANCELLED: [],
};

const actionTargets: Readonly<Record<SellerOrderAction, SellerOrderFulfillmentState>> = {
  CONFIRM: 'CONFIRMED',
  START_PREPARING: 'PREPARING',
  MARK_READY_FOR_PICKUP: 'READY_FOR_PICKUP',
  HAND_OFF: 'HANDED_OFF',
  REJECT: 'REJECTED',
};

export function canTransitionSellerFulfillment(
  current: SellerOrderFulfillmentState,
  target: SellerOrderFulfillmentState,
): boolean {
  return transitions[current]?.includes(target) ?? false;
}

export function targetForSellerAction(action: SellerOrderAction): SellerOrderFulfillmentState {
  return actionTargets[action];
}

export function canExecuteSellerAction(
  context: SellerOrderStateContext,
  action: SellerOrderAction,
): boolean {
  if (
    context.orderStatus === 'CANCELLED' ||
    context.orderStatus === 'DELIVERED' ||
    context.orderStatus === 'RETURN_REQUESTED' ||
    context.orderStatus === 'RETURNED' ||
    context.orderStatus === 'REFUNDED'
  )
    return false;
  if (action === 'HAND_OFF' && context.shipmentExists) return false;
  const target = targetForSellerAction(action);
  if (action === 'CONFIRM' || action === 'REJECT')
    return (
      context.orderStatus === 'PENDING_CONFIRMATION' &&
      context.fulfillmentState === 'PENDING_CONFIRMATION'
    );
  if (action === 'START_PREPARING' || action === 'MARK_READY_FOR_PICKUP' || action === 'HAND_OFF')
    return (
      context.orderStatus === 'AWAITING_PICKUP' &&
      canTransitionSellerFulfillment(context.fulfillmentState, target)
    );
  return false;
}

export function availableSellerActions(context: SellerOrderStateContext): SellerOrderAction[] {
  return (
    ['CONFIRM', 'START_PREPARING', 'MARK_READY_FOR_PICKUP', 'HAND_OFF', 'REJECT'] as const
  ).filter((action) => canExecuteSellerAction(context, action));
}

export function deadlineIsLate(
  action: SellerOrderAction,
  now: Date,
  confirmationAt: Date,
  handoffAt: Date | null,
): boolean {
  return action === 'CONFIRM' || action === 'REJECT'
    ? now.getTime() > confirmationAt.getTime()
    : action === 'HAND_OFF' && handoffAt !== null
      ? now.getTime() > handoffAt.getTime()
      : false;
}

export function resultingOrderStatus(action: SellerOrderAction): ShopOrderStatus | null {
  if (action === 'CONFIRM') return 'AWAITING_PICKUP';
  if (action === 'HAND_OFF') return 'SHIPPING';
  if (action === 'REJECT') return 'CANCELLED';
  return null;
}
