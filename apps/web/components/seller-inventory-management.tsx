'use client';

import type { InventoryAdjustment, InventoryAdjustmentReason, InventoryBalance } from '@shopee-clone/contracts';
import { ChevronDown, RotateCcw, Search, SquarePen } from '@shopee-clone/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { adjustSellerInventory, fetchSellerInventory, fetchSellerInventoryHistory } from '../lib/inventory-api';
import { RoleApiError } from '../lib/role-api';
import { marketplaceMediaUrl } from '../lib/marketplace-media-url';
import { useAuthSession } from './auth-session-provider';
import { SellerPagination } from './seller/seller-pagination';

type InventorySort = 'newest' | 'oldest' | 'quantity';

const money = (value: number) => new Intl.NumberFormat('vi-VN').format(value);

function InventoryProductImage({ item }: { item: InventoryBalance }) {
  const [failed, setFailed] = useState(false);
  if (!item.productImageUrl || failed) return <span className="seller-inventory-product-image seller-inventory-product-image--fallback" aria-label={`Chưa có ảnh cho ${item.productName}`}>Ảnh</span>;
  return <img className="seller-inventory-product-image" src={marketplaceMediaUrl(item.productImageUrl)} alt={`Ảnh ${item.productName}`} onError={() => setFailed(true)} />;
}

export function SellerInventoryManagement() {
  const { state, authenticatedFetch } = useAuthSession();
  const [items, setItems] = useState<InventoryBalance[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [sort, setSort] = useState<InventorySort>('newest');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<InventoryBalance | null>(null);
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState<InventoryAdjustmentReason>('RESTOCK');
  const [note, setNote] = useState('');
  const [history, setHistory] = useState<InventoryAdjustment[] | null>(null);

  const load = useCallback(async (targetPage = 1) => {
    if (state.status !== 'authenticated') return;
    setLoading(true); setError(null);
    try { const response = await fetchSellerInventory(authenticatedFetch, { page: targetPage }); const lastPage = Math.max(1, response.totalPages); if (targetPage > lastPage) { setPage(lastPage); return; } setItems(response.items); setPage(response.page); setPageSize(response.pageSize); setTotalItems(response.totalItems); setTotalPages(response.totalPages); }
    catch (cause) { setError(cause instanceof RoleApiError ? cause.problem?.detail ?? 'Không thể tải tồn kho.' : 'Không thể tải tồn kho.'); }
    finally { setLoading(false); }
  }, [authenticatedFetch, state.status]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(page); }, [load, page]);

  const submitAdjustment = async () => {
    if (!selected) return;
    const parsed = Number(delta);
    if (!Number.isSafeInteger(parsed) || parsed === 0) { setError('Số lượng thay đổi phải là số nguyên khác 0.'); return; }
    try { await adjustSellerInventory(authenticatedFetch, selected.variantId, selected.version, { delta: parsed, reason, note: note.trim() || null }); setSelected(null); setDelta(''); setNote(''); await load(page); }
    catch (cause) { setError(cause instanceof RoleApiError ? cause.problem?.detail ?? 'Không thể cập nhật tồn kho.' : 'Không thể cập nhật tồn kho.'); }
  };
  const showHistory = async (item: InventoryBalance) => { try { setHistory((await fetchSellerInventoryHistory(authenticatedFetch, item.variantId)).items); } catch { setError('Không thể tải lịch sử tồn kho.'); } };

  const visibleItems = useMemo(() => {
    const term = searchTerm.trim().toLocaleLowerCase('vi-VN');
    const filtered = items.filter((item) => {
      if (!term) return true;
      return [item.productName, item.variantName, item.sku]
        .some((value) => value.toLocaleLowerCase('vi-VN').includes(term));
    });

    return [...filtered].sort((left, right) => {
      if (sort === 'quantity') return right.availableQuantity - left.availableQuantity || left.variantId.localeCompare(right.variantId);
      const leftTime = Date.parse(left.updatedAt);
      const rightTime = Date.parse(right.updatedAt);
      return sort === 'newest'
        ? rightTime - leftTime || left.variantId.localeCompare(right.variantId)
        : leftTime - rightTime || left.variantId.localeCompare(right.variantId);
    });
  }, [items, searchTerm, sort]);

  if (state.status !== 'authenticated') return <section className="operational-state"><h1>Quản lý tồn kho</h1><p>Vui lòng đăng nhập tài khoản seller để xem tồn kho.</p></section>;
  return (
    <section className="seller-inventory-page" data-testid="seller-inventory-page">
      <div className="seller-pl-toolbar seller-pl-toolbar--labeled seller-inventory-toolbar">
        <div className="seller-pl-toolbar__filters">
          <div className="seller-pl-search seller-inventory-search">
            <Search className="seller-pl-search__icon" size={16} aria-hidden="true" />
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => { setSearchTerm(event.target.value); setPage(1); }}
              placeholder="Tên sản phẩm hoặc SKU"
              aria-label="Tìm kiếm tồn kho"
            />
          </div>
          <div className="seller-pl-field seller-inventory-sort">
            <label htmlFor="seller-inventory-sort">Sắp xếp</label>
            <div className="seller-pl-select-wrap">
              <select id="seller-inventory-sort" className="seller-pl-select" value={sort} onChange={(event) => { setSort(event.target.value as InventorySort); setPage(1); }}>
                <option value="newest">Mới nhất</option>
                <option value="oldest">Cũ nhất</option>
                <option value="quantity">Số lượng</option>
              </select>
              <ChevronDown className="seller-pl-select__arrow" size={16} aria-hidden="true" />
            </div>
          </div>
        </div>
        <Link className="seller-pl-btn-add" href="/seller/products/new">Thêm sản phẩm</Link>
      </div>

      {loading ? <p className="seller-inventory-state">Đang tải tồn kho…</p> : null}
      {error ? <div className="seller-inventory-error"><p>{error}</p><button type="button" onClick={() => void load(page)}>Thử lại</button></div> : null}
      {!loading && !error && items.length === 0 ? <p className="seller-inventory-state">Chưa có sản phẩm đang bán để quản lý tồn kho. Chỉ hiển thị sản phẩm đang bán; sản phẩm nháp, ẩn, lưu trữ hoặc bị xóa sẽ không xuất hiện tại đây.</p> : null}
      {!loading && !error && items.length > 0 ? (
        <>
          <div className="seller-pl-table-stack">
            <div className="seller-pl-table-card seller-inventory-table-card">
              <div className="seller-pl-table-scroll">
                <table className="seller-pl-table seller-management-table seller-inventory-table">
                  <thead><tr><th className="management-table-id-cell">ID</th><th>Sản phẩm / SKU</th><th>Trạng thái</th><th>Hiện có</th><th>Đang giữ</th><th>Đã bán</th><th>Khả dụng</th><th>Cập nhật</th><th>Thao tác</th></tr></thead>
                  <tbody>
                    {visibleItems.length ? visibleItems.map((item) => (
                      <tr key={item.variantId}>
                        <td className="management-table-id-cell">{item.variantId}</td>
                        <td><div className="seller-inventory-product-cell"><InventoryProductImage item={item} /><span className="seller-inventory-product-copy"><strong>{item.productName}</strong><span>{item.variantName} · {item.sku}</span></span></div></td>
                        <td><span className="seller-table-status">{item.lifecycle === 'active' ? 'Đang bán' : 'Tạm dừng'}</span></td>
                        <td>{money(item.quantityOnHand)}</td>
                        <td>{money(item.quantityReserved)}</td>
                        <td>{money(item.quantitySold)}</td>
                        <td><strong className={item.lowStock ? 'seller-inventory-low' : ''}>{money(item.availableQuantity)}</strong>{item.lowStock ? <small>Sắp hết hàng</small> : null}</td>
                        <td>{new Date(item.updatedAt).toLocaleDateString('vi-VN')}</td>
                        <td><div className="seller-inventory-row-actions"><button type="button" className="seller-pl-btn-icon" aria-label={`Điều chỉnh tồn kho ${item.productName} ${item.variantName}`} title="Điều chỉnh tồn kho" onClick={() => setSelected(item)}><SquarePen size={16} aria-hidden="true" /></button><button type="button" className="seller-pl-btn-icon" aria-label={`Xem lịch sử tồn kho ${item.productName} ${item.variantName}`} title="Xem lịch sử tồn kho" onClick={() => void showHistory(item)}><RotateCcw size={16} aria-hidden="true" /></button></div></td>
                      </tr>
                    )) : <tr><td className="seller-inventory-table__empty" colSpan={9}>Không tìm thấy sản phẩm hoặc SKU phù hợp.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
            <SellerPagination itemLabel="biến thể" page={page} pageSize={pageSize} totalItems={totalItems} totalPages={totalPages} disabled={loading} onPageChange={setPage} />
          </div>
        </>
      ) : null}

      {selected ? <div className="seller-inventory-modal" role="dialog" aria-modal="true" aria-labelledby="inventory-adjust-title"><div className="seller-inventory-modal__card"><h2 id="inventory-adjust-title">Điều chỉnh tồn kho</h2><p>{selected.productName} · {selected.variantName}</p><label>Thay đổi số lượng<input autoFocus inputMode="numeric" value={delta} onChange={(event) => setDelta(event.target.value.replace(/[^-\d]/g, ''))} placeholder="Ví dụ: 20 hoặc -3" /></label><label>Lý do<select value={reason} onChange={(event) => setReason(event.target.value as InventoryAdjustmentReason)}><option value="RESTOCK">Nhập thêm</option><option value="DAMAGE">Hư hỏng</option><option value="RETURN">Khách trả hàng</option><option value="CORRECTION">Điều chỉnh khác</option></select></label><label>Ghi chú (không bắt buộc)<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} /></label><div className="seller-inventory-modal__actions"><button type="button" onClick={() => setSelected(null)}>Hủy</button><button type="button" onClick={() => void submitAdjustment()}>Lưu điều chỉnh</button></div></div></div> : null}
      {history ? <div className="seller-inventory-history"><div className="seller-inventory-history__heading"><h2>Lịch sử điều chỉnh</h2><button type="button" onClick={() => setHistory(null)}>Đóng</button></div>{history.length ? <ul>{history.map((entry) => <li key={entry.id}><strong>{entry.delta > 0 ? '+' : ''}{entry.delta}</strong><span>{entry.reason} · {new Date(entry.occurredAt).toLocaleString('vi-VN')}</span><small>{entry.quantityOnHandBefore} → {entry.quantityOnHandAfter}{entry.note ? ` · ${entry.note}` : ''}</small></li>)}</ul> : <p>Chưa có lịch sử.</p>}</div> : null}
    </section>
  );
}
