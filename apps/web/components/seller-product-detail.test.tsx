import { render, screen, waitFor } from '@testing-library/react';
import { SellerProductDetailView } from './seller-product-detail';

const fetchProduct = vi.fn();
const fetchCategories = vi.fn();
const authenticatedFetch = vi.fn();

vi.mock('./auth-session-provider', () => ({
  useAuthSession: () => ({
    authenticatedFetch,
    state: { status: 'authenticated', user: { roles: ['buyer', 'seller'] } },
  }),
}));
vi.mock('../lib/seller-products-api', () => ({
  fetchSellerProduct: (...args: unknown[]) => fetchProduct(...args),
  fetchSellerProductCategories: (...args: unknown[]) => fetchCategories(...args),
}));

describe('SellerProductDetailView', () => {
  beforeEach(() => {
    fetchProduct.mockReset();
    fetchCategories.mockReset();
  });

  it('renders read-only product information and links to the edit route', async () => {
    const productId = '00000000-0000-4000-8000-000000000101';
    fetchProduct.mockResolvedValue({
      id: productId,
      slug: 'guong-abc123',
      name: 'Gương trang trí',
      description: 'Mô tả sản phẩm',
      categoryId: '00000000-0000-4000-8000-000000000102',
      attributes: [],
      media: [{ id: '00000000-0000-4000-8000-000000000103', url: 'https://cdn.example.test/mirror.jpg', altText: null, sortOrder: 0, variantId: null }],
      packageLengthMm: 100,
      packageWidthMm: 80,
      packageHeightMm: 10,
      optionGroups: [],
      optionValueMedia: [],
      variants: [{ id: '00000000-0000-4000-8000-000000000104', combination: [], sku: 'SKU-MIRROR', priceMinor: 125000, compareAtPriceMinor: null, stock: 4, weightGrams: 500, maxPurchaseQuantity: null, active: true }],
      lifecycle: 'draft',
      moderationStatus: 'active',
      moderationReason: null,
      createdAt: '2026-08-17T00:00:00.000Z',
      updatedAt: '2026-08-17T00:00:00.000Z',
    });
    fetchCategories.mockResolvedValue([{ id: '00000000-0000-4000-8000-000000000102', name: 'Nội thất', slug: 'noi-that', parentId: null, isLeaf: true, attributes: [] }]);

    render(<SellerProductDetailView productId={productId} />);

    expect(await screen.findByTestId('seller-product-detail')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Gương trang trí' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Mô tả sản phẩm', level: 2 })).toBeInTheDocument();
    expect(screen.getByText('Nội thất')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cập nhật sản phẩm' })).toHaveAttribute('href', `/seller/products/${productId}/edit`);
    await waitFor(() => expect(fetchProduct).toHaveBeenCalledWith(expect.anything(), productId));
  });
});
