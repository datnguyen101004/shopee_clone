import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SellerReviewManagement } from './seller-review-management';
import { listSellerShopReviews, submitSellerReviewReport } from '../lib/seller-review-report-api';

const authenticatedFetch = vi.fn();
const reviewId = '123e4567-e89b-12d3-a456-426614174000';

vi.mock('./auth-session-provider', () => ({
  useAuthSession: () => ({
    authenticatedFetch,
    state: {
      status: 'authenticated',
      user: { id: 'seller-1', roles: ['buyer', 'seller'] },
    },
  }),
}));

vi.mock('../lib/seller-review-report-api', () => ({
  SellerReviewReportApiError: class SellerReviewReportApiError extends Error {},
  listSellerShopReviews: vi.fn(),
  submitSellerReviewReport: vi.fn(),
}));

describe('SellerReviewManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('crypto', { randomUUID: () => '123e4567-e89b-12d3-a456-426614174001' });
    vi.mocked(listSellerShopReviews).mockResolvedValue({
      items: [{
        id: reviewId,
        productId: '123e4567-e89b-12d3-a456-426614174002',
        productName: 'Áo khoác của shop',
        rating: 2,
        comment: 'Nội dung đánh giá cần xem xét',
        visibility: 'VISIBLE',
        reportStatus: 'NOT_REPORTED',
        createdAt: '2026-08-21T12:00:00.000Z',
        updatedAt: '2026-08-21T12:00:00.000Z',
      }],
    });
  });

  it('shows only seller-shop reviews and submits a confirmation-gated report', async () => {
    const user = userEvent.setup();
    vi.mocked(submitSellerReviewReport).mockResolvedValue({
      id: '123e4567-e89b-12d3-a456-426614174010', reviewId, status: 'SUBMITTED', createdAt: '2026-08-21T12:00:00.000Z',
    });

    render(<SellerReviewManagement />);
    expect(await screen.findByText('Áo khoác của shop')).toBeInTheDocument();
    expect(screen.queryByText('Buyer Example')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Báo cáo đánh giá' }));
    await user.selectOptions(screen.getByLabelText('Lý do báo cáo'), 'SPAM_OR_FRAUD');
    await user.type(screen.getByLabelText('Mô tả thêm (không bắt buộc)'), 'Đánh giá dẫn người mua tới trang thanh toán không liên quan.');
    await user.click(screen.getByRole('button', { name: 'Tiếp tục' }));
    await user.click(screen.getByRole('button', { name: 'Xác nhận gửi báo cáo' }));

    await waitFor(() => expect(submitSellerReviewReport).toHaveBeenCalledWith(
      reviewId,
      { reasonCode: 'SPAM_OR_FRAUD', details: 'Đánh giá dẫn người mua tới trang thanh toán không liên quan.' },
      '123e4567-e89b-12d3-a456-426614174001',
      authenticatedFetch,
    ));
    expect(await screen.findAllByText(/Đã gửi báo cáo/)).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Đã báo cáo' })).toBeDisabled();
  });

  it('omits report button when review visibility is hidden', async () => {
    vi.mocked(listSellerShopReviews).mockResolvedValue({
      items: [{
        id: reviewId,
        productId: '123e4567-e89b-12d3-a456-426614174002',
        productName: 'Áo khoác của shop',
        rating: 1,
        comment: 'Đánh giá vi phạm đã bị ẩn',
        visibility: 'HIDDEN',
        reportStatus: 'RESOLVED',
        createdAt: '2026-08-21T12:00:00.000Z',
        updatedAt: '2026-08-21T12:00:00.000Z',
      }],
    });

    render(<SellerReviewManagement />);
    expect(await screen.findByText('Áo khoác của shop')).toBeInTheDocument();
    expect(screen.getByText('Đánh giá này hiện đang bị ẩn công khai.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /báo cáo/i })).not.toBeInTheDocument();
  });

  it('searches loaded reviews and sorts by rating', async () => {
    const user = userEvent.setup();
    vi.mocked(listSellerShopReviews).mockResolvedValue({
      items: [
        {
          id: reviewId,
          productId: '123e4567-e89b-12d3-a456-426614174002',
          productName: 'Áo khoác của shop',
          rating: 2,
          comment: 'Nội dung đánh giá cần xem xét',
          visibility: 'VISIBLE',
          reportStatus: 'NOT_REPORTED',
          createdAt: '2026-08-21T12:00:00.000Z',
          updatedAt: '2026-08-21T12:00:00.000Z',
        },
        {
          id: '123e4567-e89b-12d3-a456-426614174003',
          productId: '123e4567-e89b-12d3-a456-426614174004',
          productName: 'Giày thể thao của shop',
          rating: 5,
          comment: 'Đóng gói tốt',
          visibility: 'VISIBLE',
          reportStatus: 'NOT_REPORTED',
          createdAt: '2026-08-22T12:00:00.000Z',
          updatedAt: '2026-08-22T12:00:00.000Z',
        },
      ],
    });

    render(<SellerReviewManagement />);
    await screen.findByText('Giày thể thao của shop');
    await user.selectOptions(screen.getByLabelText('Sắp xếp'), 'highest-rating');
    const cards = screen.getAllByRole('article');
    expect(cards[0]).toHaveTextContent('Giày thể thao của shop');
    await user.type(screen.getByLabelText('Tìm kiếm đánh giá'), 'Áo khoác');
    expect(screen.getByText('Áo khoác của shop')).toBeInTheDocument();
    expect(screen.queryByText('Giày thể thao của shop')).not.toBeInTheDocument();
    expect(screen.getByText(/đánh giá đã tải/)).toHaveTextContent('Hiển thị 1 trong 2 đánh giá đã tải');
  });
});
