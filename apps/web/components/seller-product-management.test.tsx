import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SellerProductEditor, SellerProductList } from './seller-product-management';

const routerPush = vi.fn();
const fetchProducts = vi.fn();
const fetchCategories = vi.fn();
const fetchProduct = vi.fn();
const createProduct = vi.fn();
const updateProduct = vi.fn();
const transitionProduct = vi.fn();
const deleteDraft = vi.fn();
const stageMedia = vi.fn();
const authenticatedFetch = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: routerPush }) }));

vi.mock('./auth-session-provider', () => ({
  useAuthSession: () => ({
    authenticatedFetch,
    state: { status: 'authenticated', user: { roles: ['buyer', 'seller'] } },
  }),
}));
vi.mock('../lib/seller-products-api', () => ({
  fetchSellerProducts: (...args: unknown[]) => fetchProducts(...args),
  fetchSellerProductCategories: (...args: unknown[]) => fetchCategories(...args),
  fetchSellerProduct: (...args: unknown[]) => fetchProduct(...args),
  createSellerProduct: (...args: unknown[]) => createProduct(...args),
  updateSellerProduct: (...args: unknown[]) => updateProduct(...args),
  transitionSellerProduct: (...args: unknown[]) => transitionProduct(...args),
  deleteSellerProductDraft: (...args: unknown[]) => deleteDraft(...args),
  stageSellerProductMedia: (...args: unknown[]) => stageMedia(...args),
}));

describe('Seller product management', () => {
  beforeEach(() => {
    routerPush.mockReset();
    fetchProducts.mockReset();
    fetchCategories.mockReset();
    fetchProduct.mockReset();
    createProduct.mockReset();
    updateProduct.mockReset();
    transitionProduct.mockReset();
    deleteDraft.mockReset();
    stageMedia.mockReset();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:test'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  });
  it('shows seller-owned products only in the private list', async () => {
    fetchProducts.mockResolvedValue({
      items: [
        {
          id: '00000000-0000-4000-8000-000000000101',
          slug: 'sample-product',
          name: 'Sample Product',
          categoryName: 'Thiết bị điện tử',
          lifecycle: 'draft',
          moderationStatus: 'active',
          primaryMediaUrl: null,
          variantCount: 1,
          stockQuantity: 3,
          updatedAt: '2026-08-17T00:00:00.000Z',
        },
      ],
      nextCursor: null,
    });
    render(<SellerProductList />);
    expect(await screen.findByText('Sample Product')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Thêm sản phẩm' })).toHaveAttribute(
      'href',
      '/seller/products/new',
    );
    expect(screen.getByRole('link', { name: 'Cập nhật sản phẩm' })).toHaveAttribute(
      'href',
      '/seller/products/00000000-0000-4000-8000-000000000101/edit',
    );
    expect(screen.getByRole('link', { name: /Sample Product/ })).toHaveAttribute(
      'href',
      '/seller/products/00000000-0000-4000-8000-000000000101',
    );
    expect(screen.getByRole('button', { name: 'Đăng bán' })).toBeInTheDocument();
  });

  it('publishes a draft directly from the seller product list', async () => {
    const productId = '00000000-0000-4000-8000-000000000101';
    fetchProducts.mockResolvedValue({
      items: [
        {
          id: productId,
          slug: 'sample-product',
          name: 'Sample Product',
          categoryName: 'Thiết bị điện tử',
          lifecycle: 'draft',
          moderationStatus: 'active',
          primaryMediaUrl: null,
          variantCount: 1,
          stockQuantity: 3,
          updatedAt: '2026-08-17T00:00:00.000Z',
        },
      ],
      nextCursor: null,
    });
    transitionProduct.mockResolvedValue({});
    render(<SellerProductList />);
    await screen.findByText('Sample Product');
    fireEvent.click(screen.getByRole('button', { name: 'Đăng bán' }));
    await waitFor(() =>
      expect(transitionProduct).toHaveBeenCalledWith(expect.anything(), productId, 'published'),
    );
    expect(await screen.findByText('Đang bán', { selector: 'b' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Sản phẩm đã được đăng bán.');
  });

  it('hides a published product from the seller product list', async () => {
    const productId = '00000000-0000-4000-8000-000000000101';
    fetchProducts.mockResolvedValue({
      items: [{
        id: productId, slug: 'sample-product', name: 'Sample Product', categoryName: 'Thiết bị điện tử',
        lifecycle: 'published', moderationStatus: 'active', primaryMediaUrl: null, variantCount: 1, stockQuantity: 3, updatedAt: '2026-08-17T00:00:00.000Z',
      }],
      nextCursor: null,
    });
    transitionProduct.mockResolvedValue({});
    render(<SellerProductList />);
    await screen.findByText('Sample Product');
    fireEvent.click(screen.getByRole('button', { name: 'Ẩn sản phẩm Sample Product' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('biến mất khỏi trang mua sắm');
    fireEvent.click(screen.getByRole('button', { name: 'Ẩn sản phẩm' }));
    await waitFor(() =>
      expect(transitionProduct).toHaveBeenCalledWith(expect.anything(), productId, 'hidden'),
    );
    expect(await screen.findByText('Đã ẩn', { selector: 'b' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Đã ẩn sản phẩm.');
  });

  it('uses a custom alertdialog before deleting a draft and removes it from the list', async () => {
    const productId = '00000000-0000-4000-8000-000000000101';
    fetchProducts.mockResolvedValue({
      items: [{ id: productId, slug: 'draft-product', name: 'Bản nháp cần xóa', categoryName: 'Thiết bị điện tử', lifecycle: 'draft', moderationStatus: 'active', primaryMediaUrl: null, variantCount: 1, stockQuantity: 1, updatedAt: '2026-08-17T00:00:00.000Z' }],
      nextCursor: null,
    });
    deleteDraft.mockResolvedValue(undefined);
    render(<SellerProductList />);
    await screen.findByText('Bản nháp cần xóa');
    fireEvent.click(screen.getByRole('button', { name: 'Xóa sản phẩm nháp Bản nháp cần xóa' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Dữ liệu lịch sử được giữ lại');
    fireEvent.click(screen.getByRole('button', { name: 'Xóa sản phẩm' }));
    await waitFor(() => expect(deleteDraft).toHaveBeenCalledWith(expect.anything(), productId));
    await waitFor(() => expect(screen.queryByText('Bản nháp cần xóa')).not.toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent('Đã xóa sản phẩm.');
  });
  it('soft-deletes a published product from the same custom alertdialog', async () => {
    const productId = '00000000-0000-4000-8000-000000000101';
    fetchProducts.mockResolvedValue({
      items: [{ id: productId, slug: 'published-product', name: 'Sản phẩm đang bán', categoryName: 'Thiết bị điện tử', lifecycle: 'published', moderationStatus: 'active', primaryMediaUrl: null, variantCount: 1, stockQuantity: 1, updatedAt: '2026-08-17T00:00:00.000Z' }],
      nextCursor: null,
    });
    deleteDraft.mockResolvedValue(undefined);
    render(<SellerProductList />);
    await screen.findByText('Sản phẩm đang bán');
    fireEvent.click(screen.getByRole('button', { name: 'Xóa sản phẩm đang bán Sản phẩm đang bán' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xóa sản phẩm' }));
    await waitFor(() => expect(deleteDraft).toHaveBeenCalledWith(expect.anything(), productId));
    await waitFor(() => expect(screen.queryByText('Sản phẩm đang bán')).not.toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent('Đã xóa sản phẩm.');
  });
  it('cancels with Escape, restores focus, and prevents duplicate destructive requests', async () => {
    const productId = '00000000-0000-4000-8000-000000000101';
    fetchProducts.mockResolvedValue({
      items: [{ id: productId, slug: 'draft-product', name: 'Bản nháp bàn phím', categoryName: 'Thiết bị điện tử', lifecycle: 'draft', moderationStatus: 'active', primaryMediaUrl: null, variantCount: 1, stockQuantity: 1, updatedAt: '2026-08-17T00:00:00.000Z' }],
      nextCursor: null,
    });
    let resolveDelete!: () => void;
    deleteDraft.mockImplementation(() => new Promise<void>((resolve) => { resolveDelete = resolve; }));
    render(<SellerProductList />);
    await screen.findByText('Bản nháp bàn phím');
    const trigger = screen.getByRole('button', { name: 'Xóa sản phẩm nháp Bản nháp bàn phím' });
    fireEvent.click(trigger);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Xóa sản phẩm' })).toHaveFocus());
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('button', { name: 'Xóa sản phẩm' }));
    fireEvent.click(screen.getByRole('button', { name: 'Đang xử lý…' }));
    expect(deleteDraft).toHaveBeenCalledTimes(1);
    resolveDelete();
    await waitFor(() => expect(screen.queryByText('Bản nháp bàn phím')).not.toBeInTheDocument());
  });
  it('loads an existing draft into the editor instead of showing an empty form', async () => {
    const productId = '00000000-0000-4000-8000-000000000101';
    const categoryId = '00000000-0000-4000-8000-000000000102';
    fetchCategories.mockResolvedValue([
      {
        id: categoryId,
        name: 'Thiết bị điện tử',
        slug: 'thiet-bi-dien-tu',
        parentId: null,
        isLeaf: true,
        attributes: [],
      },
    ]);
    fetchProduct.mockResolvedValue({
      id: productId,
      slug: 'sample-product-abc123',
      name: 'Sản phẩm đã lưu',
      description: 'Mô tả đã lưu',
      categoryId,
      attributes: [],
      media: [],
      packageLengthMm: 100,
      packageWidthMm: 100,
      packageHeightMm: 100,
      optionGroups: [],
      optionValueMedia: [],
      variants: [
        {
          id: '00000000-0000-4000-8000-000000000103',
          combination: [],
          sku: 'SAMPLE-SKU',
          priceMinor: 500000,
          compareAtPriceMinor: null,
          stock: 7,
          weightGrams: 500,
          maxPurchaseQuantity: null,
          active: true,
        },
      ],
      lifecycle: 'draft',
      moderationStatus: 'active',
      moderationReason: null,
      createdAt: '2026-08-17T00:00:00.000Z',
      updatedAt: '2026-08-17T00:00:00.000Z',
    });
    render(<SellerProductEditor productId={productId} />);
    await screen.findByText('Chỉnh sửa sản phẩm');
    expect(screen.getByLabelText('Tên sản phẩm')).toHaveValue('Sản phẩm đã lưu');
    expect(screen.getByLabelText('Mô tả')).toHaveValue('Mô tả đã lưu');
    expect(screen.getByLabelText('Danh mục')).toHaveValue(categoryId);
    expect(screen.getByLabelText('Giá bán mặc định')).toHaveValue('500.000');
    expect(screen.getByLabelText('Tồn kho mặc định')).toHaveValue('7');
    expect(screen.getByRole('button', { name: 'Hủy' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cập nhật' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Lưu nháp' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Đăng bán' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ẩn sản phẩm' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Lưu trữ' })).not.toBeInTheDocument();
  });

  it('updates an existing product without staging media when images are unchanged', async () => {
    const productId = '00000000-0000-4000-8000-000000000101';
    const categoryId = '00000000-0000-4000-8000-000000000102';
    const imageId = '00000000-0000-4000-8000-000000000109';
    const saved = {
      id: productId,
      slug: 'sample-product-abc123',
      name: 'Sản phẩm đã lưu',
      description: 'Mô tả đã lưu',
      categoryId,
      attributes: [],
      media: [{ id: imageId, url: `/api/v1/product-media/${imageId}`, altText: null, sortOrder: 0, variantId: null }],
      packageLengthMm: 100,
      packageWidthMm: 100,
      packageHeightMm: 100,
      optionGroups: [],
      optionValueMedia: [],
      variants: [{ id: '00000000-0000-4000-8000-000000000103', combination: [], sku: 'SAMPLE-SKU', priceMinor: 500000, compareAtPriceMinor: null, stock: 7, weightGrams: 500, maxPurchaseQuantity: null, active: true }],
      lifecycle: 'published',
      moderationStatus: 'active',
      moderationReason: null,
      createdAt: '2026-08-17T00:00:00.000Z',
      updatedAt: '2026-08-17T00:00:00.000Z',
    };
    fetchCategories.mockResolvedValue([{ id: categoryId, name: 'Thiết bị điện tử', slug: 'thiet-bi-dien-tu', parentId: null, isLeaf: true, attributes: [] }]);
    fetchProduct.mockResolvedValue(saved);
    updateProduct.mockResolvedValue({ ...saved, name: 'Sản phẩm đã lưu' });
    render(<SellerProductEditor productId={productId} />);
    await screen.findByText('Chỉnh sửa sản phẩm');
    fireEvent.click(screen.getByRole('button', { name: 'Cập nhật' }));
    await waitFor(() => expect(updateProduct).toHaveBeenCalledTimes(1));
    expect(stageMedia).not.toHaveBeenCalled();
    expect(updateProduct).toHaveBeenCalledWith(
      authenticatedFetch,
      productId,
      expect.objectContaining({ media: [expect.objectContaining({ imageId, sortOrder: 0 })] }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Đã cập nhật sản phẩm.');
  });

  it('stages only newly selected images when updating a product', async () => {
    const productId = '00000000-0000-4000-8000-000000000101';
    const categoryId = '00000000-0000-4000-8000-000000000102';
    const imageId = '00000000-0000-4000-8000-000000000109';
    const assetId = '00000000-0000-4000-8000-000000000110';
    const saved = {
      id: productId, slug: 'sample-product-abc123', name: 'Sản phẩm đã lưu', description: 'Mô tả đã lưu', categoryId, attributes: [],
      media: [{ id: imageId, url: `/api/v1/product-media/${imageId}`, altText: null, sortOrder: 0, variantId: null }],
      packageLengthMm: 100, packageWidthMm: 100, packageHeightMm: 100, optionGroups: [], optionValueMedia: [],
      variants: [{ id: '00000000-0000-4000-8000-000000000103', combination: [], sku: 'SAMPLE-SKU', priceMinor: 500000, compareAtPriceMinor: null, stock: 7, weightGrams: 500, maxPurchaseQuantity: null, active: true }],
      lifecycle: 'published', moderationStatus: 'active', moderationReason: null, createdAt: '2026-08-17T00:00:00.000Z', updatedAt: '2026-08-17T00:00:00.000Z',
    };
    fetchCategories.mockResolvedValue([{ id: categoryId, name: 'Thiết bị điện tử', slug: 'thiet-bi-dien-tu', parentId: null, isLeaf: true, attributes: [] }]);
    fetchProduct.mockResolvedValue(saved);
    stageMedia.mockResolvedValue({ id: assetId, mimeType: 'image/png', byteSize: 12, width: 1, height: 1, previewUrl: '/preview/new', expiresAt: '2026-08-18T00:00:00.000Z' });
    updateProduct.mockResolvedValue(saved);
    render(<SellerProductEditor productId={productId} />);
    await screen.findByText('Chỉnh sửa sản phẩm');
    fireEvent.change(screen.getByLabelText('Chọn ảnh từ máy'), { target: { files: [new File(['png'], 'extra.png', { type: 'image/png' })] } });
    await waitFor(() => expect(screen.getAllByAltText(/Ảnh sản phẩm/)).toHaveLength(2));
    fireEvent.click(screen.getByRole('button', { name: 'Cập nhật' }));
    await waitFor(() => expect(updateProduct).toHaveBeenCalledTimes(1));
    expect(stageMedia).toHaveBeenCalledTimes(1);
    expect(updateProduct.mock.calls[0]?.[2]).toMatchObject({
      media: [expect.objectContaining({ imageId }), expect.objectContaining({ assetId, sortOrder: 1 })],
    });
  });

  it('adds classification values and generates Color x Size variants before submission', async () => {
    fetchCategories.mockResolvedValue([
      {
        id: '00000000-0000-4000-8000-000000000102',
        name: 'Thiết bị điện tử',
        slug: 'thiet-bi-dien-tu',
        parentId: null,
        isLeaf: true,
        attributes: [],
      },
    ]);
    render(<SellerProductEditor />);
    await screen.findByText('Thêm sản phẩm mới');
    fireEvent.click(screen.getByRole('button', { name: '+ Thêm nhóm phân loại' }));
    fireEvent.change(screen.getByLabelText('Tên nhóm phân loại 1'), {
      target: { value: 'Màu sắc' },
    });
    fireEvent.change(screen.getByLabelText('Giá trị 1-1'), { target: { value: 'Đỏ' } });
    fireEvent.click(screen.getByRole('button', { name: '+ Thêm giá trị' }));
    fireEvent.change(screen.getByLabelText('Giá trị 1-2'), { target: { value: 'Xanh' } });
    fireEvent.click(screen.getByRole('button', { name: '+ Thêm nhóm phân loại' }));
    fireEvent.change(screen.getByLabelText('Tên nhóm phân loại 2'), {
      target: { value: 'Kích cỡ' },
    });
    fireEvent.change(screen.getByLabelText('Giá trị 2-1'), { target: { value: 'M' } });
    fireEvent.click(screen.getAllByRole('button', { name: '+ Thêm giá trị' })[1]!);
    fireEvent.change(screen.getByLabelText('Giá trị 2-2'), { target: { value: 'L' } });
    await waitFor(() => expect(screen.getAllByText(/SKU tự sinh sau khi lưu/)).toHaveLength(4));
    expect(screen.getByText('Đỏ · M')).toBeInTheDocument();
    expect(screen.getByText('Đỏ · L')).toBeInTheDocument();
    expect(screen.getByText('Xanh · M')).toBeInTheDocument();
    expect(screen.getByText('Xanh · L')).toBeInTheDocument();
    expect(createProduct).not.toHaveBeenCalled();
  });

  it('uses editable formatted price and stock fields with a default value of one', async () => {
    fetchCategories.mockResolvedValue([
      {
        id: '00000000-0000-4000-8000-000000000102',
        name: 'Thiết bị điện tử',
        slug: 'thiet-bi-dien-tu',
        parentId: null,
        isLeaf: true,
        attributes: [],
      },
    ]);
    render(<SellerProductEditor />);
    await screen.findByText('Thêm sản phẩm mới');

    const price = screen.getByLabelText('Giá bán mặc định');
    const stock = screen.getByLabelText('Tồn kho mặc định');
    expect(price).toHaveAttribute('type', 'text');
    expect(stock).toHaveAttribute('type', 'text');
    expect(price).toHaveValue('1');
    expect(stock).toHaveValue('1');

    fireEvent.change(price, { target: { value: '500000' } });
    fireEvent.change(stock, { target: { value: '1200' } });
    expect(price).toHaveValue('500.000');
    expect(stock).toHaveValue('1.200');
  });

  it('does not create a draft when publish requirements are incomplete', async () => {
    fetchCategories.mockResolvedValue([
      {
        id: '00000000-0000-4000-8000-000000000102',
        name: 'Thiết bị điện tử',
        slug: 'thiet-bi-dien-tu',
        parentId: null,
        isLeaf: true,
        attributes: [],
      },
    ]);
    render(<SellerProductEditor />);
    await screen.findByText('Thêm sản phẩm mới');
    fireEvent.change(screen.getByLabelText('Tên sản phẩm'), { target: { value: 'Sản phẩm thử' } });
    fireEvent.change(screen.getByLabelText('Danh mục'), {
      target: { value: '00000000-0000-4000-8000-000000000102' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng bán' }));
    expect(createProduct).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Chưa thể đăng bán. Hãy bổ sung: ảnh sản phẩm, kích thước kiện hàng.',
      ),
    );
  });

  it('selects a local image, stages it, and exposes the image for a classification value', async () => {
    fetchCategories.mockResolvedValue([
      {
        id: '00000000-0000-4000-8000-000000000102',
        name: 'Thiết bị điện tử',
        slug: 'thiet-bi-dien-tu',
        parentId: null,
        isLeaf: true,
        attributes: [],
      },
    ]);
    stageMedia.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000105',
      mimeType: 'image/png',
      byteSize: 12,
      width: 1,
      height: 1,
      previewUrl:
        'http://localhost:3001/api/v1/seller/products/media/00000000-0000-4000-8000-000000000105/preview',
      expiresAt: '2026-08-18T00:00:00.000Z',
    });
    render(<SellerProductEditor />);
    await screen.findByText('Thêm sản phẩm mới');
    const file = new File(['png'], 'red.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Chọn ảnh từ máy'), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByText('Đã sẵn sàng')).toBeInTheDocument());
    expect(stageMedia).not.toHaveBeenCalled();
    expect(screen.getByAltText('Ảnh sản phẩm 1')).toHaveAttribute('src', 'blob:test');
    fireEvent.click(screen.getByRole('button', { name: '+ Thêm nhóm phân loại' }));
    fireEvent.change(screen.getByLabelText('Giá trị 1-1'), { target: { value: 'Đỏ' } });
    const selector = screen.getByLabelText('Ảnh cho giá trị 1-1');
    expect(selector).toBeInTheDocument();
    fireEvent.change(selector, { target: { value: '00000000-0000-4000-8000-000000000105' } });
    expect(screen.getByText('Đã sẵn sàng')).toBeInTheDocument();
  });

  it('keeps valid files when another file is rejected and supports reorder/remove', async () => {
    fetchCategories.mockResolvedValue([
      {
        id: '00000000-0000-4000-8000-000000000102',
        name: 'Thiết bị điện tử',
        slug: 'thiet-bi-dien-tu',
        parentId: null,
        isLeaf: true,
        attributes: [],
      },
    ]);
    stageMedia.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000105',
      mimeType: 'image/png',
      byteSize: 12,
      width: 1,
      height: 1,
      previewUrl: 'http://localhost:3001/media/105',
      expiresAt: '2026-08-18T00:00:00.000Z',
    });
    render(<SellerProductEditor />);
    await screen.findByText('Thêm sản phẩm mới');
    const valid = new File(['png'], 'one.png', { type: 'image/png' });
    const invalid = new File(['txt'], 'two.txt', { type: 'text/plain' });
    fireEvent.change(screen.getByLabelText('Chọn ảnh từ máy'), {
      target: { files: [valid, invalid] },
    });
    await waitFor(() => expect(screen.getByText('Đã sẵn sàng')).toBeInTheDocument());
    expect(screen.getByText('Chỉ hỗ trợ JPG, PNG hoặc WebP.')).toBeInTheDocument();
    expect(screen.getAllByAltText(/Ảnh sản phẩm/)).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Xóa ảnh 2' }));
    expect(screen.getAllByAltText(/Ảnh sản phẩm/)).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Xóa ảnh 1' }));
    expect(screen.getByText(/Chưa có ảnh/)).toBeInTheDocument();
  });

  it('uploads a local image only when saving and serializes the staged asset', async () => {
    const categoryId = '00000000-0000-4000-8000-000000000102';
    const assetId = '00000000-0000-4000-8000-000000000105';
    fetchCategories.mockResolvedValue([
      {
        id: categoryId,
        name: 'Thiết bị điện tử',
        slug: 'thiet-bi-dien-tu',
        parentId: null,
        isLeaf: true,
        attributes: [],
      },
    ]);
    stageMedia.mockResolvedValue({
      id: assetId,
      mimeType: 'image/png',
      byteSize: 12,
      width: 1,
      height: 1,
      previewUrl: `/api/v1/seller/products/media/${assetId}/preview`,
      expiresAt: '2026-08-18T00:00:00.000Z',
    });
    createProduct.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000106',
      slug: 'photo-product-abc123',
      name: 'Photo product',
      description: '',
      categoryId,
      attributes: [],
      media: [
        {
          id: '00000000-0000-4000-8000-000000000107',
          url: `/api/v1/product-media/${assetId}`,
          altText: null,
          sortOrder: 0,
          variantId: null,
        },
      ],
      packageLengthMm: null,
      packageWidthMm: null,
      packageHeightMm: null,
      optionGroups: [],
      optionValueMedia: [],
      variants: [
        {
          id: '00000000-0000-4000-8000-000000000108',
          combination: [],
          sku: 'PHOTO-PRODUCT-ABC123',
          priceMinor: 0,
          compareAtPriceMinor: null,
          stock: 0,
          weightGrams: 500,
          maxPurchaseQuantity: null,
          active: true,
        },
      ],
      lifecycle: 'draft',
      moderationStatus: 'active',
      moderationReason: null,
      createdAt: '2026-08-18T00:00:00.000Z',
      updatedAt: '2026-08-18T00:00:00.000Z',
    });
    render(<SellerProductEditor />);
    await screen.findByText('Thêm sản phẩm mới');
    fireEvent.change(screen.getByLabelText('Tên sản phẩm'), { target: { value: 'Photo product' } });
    fireEvent.change(screen.getByLabelText('Chọn ảnh từ máy'), {
      target: { files: [new File(['png'], 'photo.png', { type: 'image/png' })] },
    });
    await waitFor(() => expect(screen.getByText('Đã sẵn sàng')).toBeInTheDocument());
    expect(stageMedia).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu nháp' }));
    await waitFor(() => expect(createProduct).toHaveBeenCalled());
    expect(stageMedia).toHaveBeenCalledTimes(1);
    expect(stageMedia.mock.invocationCallOrder[0]).toBeLessThan(createProduct.mock.invocationCallOrder[0]!);
    expect(createProduct.mock.calls[0]?.[1]).toMatchObject({
      media: [{ assetId, altText: null, sortOrder: 0 }],
    });
    expect(screen.getByAltText('Ảnh sản phẩm 1')).toHaveAttribute(
      'src',
      `http://localhost:3001/api/v1/product-media/${assetId}`,
    );
    expect(routerPush).toHaveBeenCalledWith('/seller/products');
  });

  it('re-uploads local media after a failed save instead of retrying a stale asset id', async () => {
    const categoryId = '00000000-0000-4000-8000-000000000102';
    fetchCategories.mockResolvedValue([
      { id: categoryId, name: 'Thiết bị điện tử', slug: 'thiet-bi-dien-tu', parentId: null, isLeaf: true, attributes: [] },
    ]);
    stageMedia
      .mockResolvedValueOnce({ id: '00000000-0000-4000-8000-000000000105', mimeType: 'image/png', byteSize: 12, width: 1, height: 1, previewUrl: '/preview/old', expiresAt: '2026-08-18T00:00:00.000Z' })
      .mockResolvedValueOnce({ id: '00000000-0000-4000-8000-000000000106', mimeType: 'image/png', byteSize: 12, width: 1, height: 1, previewUrl: '/preview/new', expiresAt: '2026-08-18T00:00:00.000Z' });
    createProduct.mockRejectedValueOnce(new Error('media unavailable')).mockResolvedValueOnce({
      id: '00000000-0000-4000-8000-000000000107', slug: 'retry-product', name: 'Retry product', description: '', categoryId, attributes: [], media: [], packageLengthMm: null, packageWidthMm: null, packageHeightMm: null, optionGroups: [], optionValueMedia: [], variants: [{ id: '00000000-0000-4000-8000-000000000108', combination: [], sku: 'RETRY', priceMinor: 1, compareAtPriceMinor: null, stock: 1, weightGrams: 500, maxPurchaseQuantity: null, active: true }], lifecycle: 'draft', moderationStatus: 'active', moderationReason: null, createdAt: '2026-08-17T00:00:00.000Z', updatedAt: '2026-08-17T00:00:00.000Z',
    });
    render(<SellerProductEditor />);
    await screen.findByText('Thêm sản phẩm mới');
    fireEvent.change(screen.getByLabelText('Tên sản phẩm'), { target: { value: 'Retry product' } });
    fireEvent.change(screen.getByLabelText('Danh mục'), { target: { value: categoryId } });
    fireEvent.change(screen.getByLabelText('Chọn ảnh từ máy'), { target: { files: [new File(['png'], 'retry.png', { type: 'image/png' })] } });
    await waitFor(() => expect(screen.getByText('Đã sẵn sàng')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Lưu nháp' }));
    await waitFor(() => expect(createProduct).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu nháp' }));
    await waitFor(() => expect(createProduct).toHaveBeenCalledTimes(2));
    expect(stageMedia).toHaveBeenCalledTimes(2);
    expect(createProduct.mock.calls[1]?.[1]).toMatchObject({ media: [{ assetId: '00000000-0000-4000-8000-000000000106' }] });
  });
});
