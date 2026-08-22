import type { NotificationMetadata, NotificationType } from '@shopee-clone/contracts';

import type { NotificationRecipientInput, NotifyEventInput } from './notification.service';

export function moneyLabel(amountMinor: number | null | undefined, currency = 'VND'): string {
  if (amountMinor == null) return '';
  try {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amountMinor);
  } catch {
    return `${amountMinor} ${currency}`;
  }
}

export function orderNotificationEvent(input: {
  type: Extract<
    NotificationType,
    'ORDER_CONFIRMED' | 'ORDER_SHIPPING' | 'ORDER_DELIVERED' | 'ORDER_CANCELLED'
  >;
  orderId: string;
  buyerId: string;
  sellerOwnerId: string;
  amountMinor: number | null;
  currency?: string;
  thumbnailUrl?: string | null;
}): NotifyEventInput {
  const amount = moneyLabel(input.amountMinor, input.currency ?? 'VND');
  const shortRef = input.orderId.slice(0, 8);
  const copy: Record<typeof input.type, { buyerTitle: string; buyerBody: string; sellerTitle: string; sellerBody: string }> = {
    ORDER_CONFIRMED: {
      buyerTitle: 'Đơn hàng đã được xác nhận',
      buyerBody: `Shop đã xác nhận đơn #${shortRef}${amount ? ` (${amount})` : ''}.`,
      sellerTitle: 'Bạn đã xác nhận đơn hàng',
      sellerBody: `Đơn #${shortRef} đã chuyển sang chờ lấy hàng.`,
    },
    ORDER_SHIPPING: {
      buyerTitle: 'Đơn hàng đang được giao',
      buyerBody: `Đơn #${shortRef} đã bàn giao đơn vị vận chuyển.`,
      sellerTitle: 'Đơn hàng đã bàn giao vận chuyển',
      sellerBody: `Đơn #${shortRef} đang trong quá trình giao.`,
    },
    ORDER_DELIVERED: {
      buyerTitle: 'Đơn hàng đã giao thành công',
      buyerBody: `Đơn #${shortRef} đã được giao. Bạn có thể đánh giá sản phẩm.`,
      sellerTitle: 'Đơn hàng đã giao',
      sellerBody: `Đơn #${shortRef} đã giao thành công tới người mua.`,
    },
    ORDER_CANCELLED: {
      buyerTitle: 'Đơn hàng đã bị hủy',
      buyerBody: `Đơn #${shortRef}${amount ? ` (${amount})` : ''} đã bị hủy.`,
      sellerTitle: 'Đơn hàng đã bị hủy',
      sellerBody: `Đơn #${shortRef} đã bị hủy.`,
    },
  };
  const text = copy[input.type];
  const meta = (targetUrl: string): NotificationMetadata => ({
    targetUrl,
    thumbnailUrl: input.thumbnailUrl ?? null,
    referenceId: input.orderId,
    amountMinor: input.amountMinor,
    currency: input.currency ?? 'VND',
  });
  const recipients: NotificationRecipientInput[] = [
    {
      userId: input.buyerId,
      roleTag: 'buyer',
      title: text.buyerTitle,
      body: text.buyerBody,
      metadata: meta(`/account/orders/${input.orderId}`),
    },
  ];
  if (input.sellerOwnerId !== input.buyerId) {
    recipients.push({
      userId: input.sellerOwnerId,
      roleTag: 'seller',
      title: text.sellerTitle,
      body: text.sellerBody,
      metadata: meta(`/seller/orders/${input.orderId}`),
    });
  }
  return {
    type: input.type,
    referenceKey: `order:${input.orderId}`,
    recipients,
  };
}

export function returnNotificationEvent(input: {
  type: Extract<
    NotificationType,
    'RETURN_REQUESTED' | 'RETURN_ACCEPTED' | 'DISPUTE_ESCALATED' | 'REFUNDED'
  >;
  returnId: string;
  orderId: string;
  buyerId: string;
  sellerOwnerId: string;
  adminUserIds?: string[];
  amountMinor: number | null;
  currency?: string;
  thumbnailUrl?: string | null;
}): NotifyEventInput {
  const amount = moneyLabel(input.amountMinor, input.currency ?? 'VND');
  const shortRef = input.returnId.slice(0, 8);
  const copy: Record<
    typeof input.type,
    { buyer: string; seller: string; admin?: string; buyerBody: string; sellerBody: string; adminBody?: string }
  > = {
    RETURN_REQUESTED: {
      buyer: 'Yêu cầu trả hàng đã gửi',
      seller: 'Có yêu cầu trả hàng mới',
      buyerBody: `Yêu cầu #${shortRef} đang chờ shop phản hồi.`,
      sellerBody: `Người mua vừa tạo yêu cầu trả hàng #${shortRef}.`,
    },
    RETURN_ACCEPTED: {
      buyer: 'Shop đã chấp nhận trả hàng',
      seller: 'Bạn đã chấp nhận trả hàng',
      buyerBody: `Hãy gửi hàng trả cho yêu cầu #${shortRef}.`,
      sellerBody: `Yêu cầu #${shortRef} đã chuyển sang chờ nhận hàng trả.`,
    },
    DISPUTE_ESCALATED: {
      buyer: 'Trả hàng đã chuyển lên tranh chấp',
      seller: 'Trả hàng đã bị escalate',
      admin: 'Tranh chấp trả hàng cần xử lý',
      buyerBody: `Yêu cầu #${shortRef} đang chờ quản trị viên quyết định.`,
      sellerBody: `Yêu cầu #${shortRef} đã escalate lên admin.`,
      adminBody: `Return #${shortRef} (order ${input.orderId.slice(0, 8)}) cần xử lý.`,
    },
    REFUNDED: {
      buyer: 'Hoàn tiền thành công',
      seller: 'Đơn trả đã hoàn tiền',
      buyerBody: `Yêu cầu #${shortRef}${amount ? ` (${amount})` : ''} đã được hoàn tiền.`,
      sellerBody: `Yêu cầu #${shortRef}${amount ? ` (${amount})` : ''} đã hoàn tất hoàn tiền.`,
    },
  };
  const text = copy[input.type];
  const meta = (targetUrl: string): NotificationMetadata => ({
    targetUrl,
    thumbnailUrl: input.thumbnailUrl ?? null,
    referenceId: input.returnId,
    amountMinor: input.amountMinor,
    currency: input.currency ?? 'VND',
  });
  const recipients: NotificationRecipientInput[] = [
    {
      userId: input.buyerId,
      roleTag: 'buyer',
      title: text.buyer,
      body: text.buyerBody,
      metadata: meta(`/account/returns/${input.returnId}`),
    },
    {
      userId: input.sellerOwnerId,
      roleTag: 'seller',
      title: text.seller,
      body: text.sellerBody,
      metadata: meta(`/seller/returns/${input.returnId}`),
    },
  ];
  if (input.type === 'DISPUTE_ESCALATED') {
    for (const adminId of input.adminUserIds ?? []) {
      recipients.push({
        userId: adminId,
        roleTag: 'admin',
        title: text.admin ?? 'Tranh chấp cần xử lý',
        body: text.adminBody ?? text.sellerBody,
        metadata: meta(`/admin/returns/${input.returnId}`),
      });
    }
  }
  return {
    type: input.type,
    referenceKey: `return:${input.returnId}`,
    recipients,
  };
}

export function moderationNotificationEvent(input: {
  type: Extract<NotificationType, 'PRODUCT_APPROVED' | 'PRODUCT_REJECTED'>;
  productId: string;
  ownerUserId: string;
  productName: string;
  reason?: string | null;
}): NotifyEventInput {
  const approved = input.type === 'PRODUCT_APPROVED';
  return {
    type: input.type,
    referenceKey: `product:${input.productId}`,
    recipients: [
      {
        userId: input.ownerUserId,
        roleTag: 'seller',
        title: approved ? 'Sản phẩm đã được khôi phục' : 'Sản phẩm bị tạm khóa',
        body: approved
          ? `"${input.productName}" đã được mở bán lại.`
          : `"${input.productName}" bị tạm khóa${input.reason ? `: ${input.reason}` : '.'}`,
        metadata: {
          targetUrl: `/seller/products/${input.productId}`,
          thumbnailUrl: null,
          referenceId: input.productId,
          amountMinor: null,
          currency: null,
        },
      },
    ],
  };
}

export function voucherAssignedNotificationEvent(input: {
  voucherId: string;
  ownerUserId: string;
  code: string;
  shopId: string;
}): NotifyEventInput {
  return {
    type: 'VOUCHER_ASSIGNED',
    referenceKey: `voucher:${input.voucherId}`,
    recipients: [
      {
        userId: input.ownerUserId,
        roleTag: 'seller',
        title: 'Mã giảm giá shop đã sẵn sàng',
        body: `Voucher ${input.code} đã được tạo/cập nhật và sẵn sàng dùng.`,
        metadata: {
          targetUrl: '/seller/promotions',
          thumbnailUrl: null,
          referenceId: input.voucherId,
          amountMinor: null,
          currency: null,
        },
      },
    ],
  };
}
