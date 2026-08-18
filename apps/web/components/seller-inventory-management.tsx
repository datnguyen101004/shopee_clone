'use client';

import type { InventoryAdjustment, InventoryAdjustmentReason, InventoryBalance } from '@shopee-clone/contracts';
import { useCallback, useEffect, useState } from 'react';
import { adjustSellerInventory, fetchSellerInventory, fetchSellerInventoryHistory } from '../lib/inventory-api';
import { RoleApiError } from '../lib/role-api';
import { useAuthSession } from './auth-session-provider';

const money = (value: number) => new Intl.NumberFormat('vi-VN').format(value);

function InventoryProductImage({ item }: { item: InventoryBalance }) {
  const [failed, setFailed] = useState(false);
  if (!item.productImageUrl || failed) return <span className="seller-inventory-product-image seller-inventory-product-image--fallback" aria-label={`Chưa có ảnh cho ${item.productName}`}>Ảnh</span>;
  return <img className="seller-inventory-product-image" src={item.productImageUrl} alt={`Ảnh ${item.productName}`} onError={() => setFailed(true)} />;
}

export function SellerInventoryManagement() {
  const { state, authenticatedFetch } = useAuthSession();
  const [items, setItems] = useState<InventoryBalance[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<InventoryBalance | null>(null);
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState<InventoryAdjustmentReason>('RESTOCK');
  const [note, setNote] = useState('');
  const [history, setHistory] = useState<InventoryAdjustment[] | null>(null);

  const load = useCallback(async (cursor?: string, append = false) => {
    if (state.status !== 'authenticated') return;
    setLoading(true); setError(null);
    try { const page = await fetchSellerInventory(authenticatedFetch, { cursor, lowStock: lowStockOnly }); setItems((current) => append ? [...current, ...page.items] : page.items); setNextCursor(page.nextCursor); }
    catch (cause) { setError(cause instanceof RoleApiError ? cause.problem?.detail ?? 'Không thể tải tồn kho.' : 'Không thể tải tồn kho.'); }
    finally { setLoading(false); }
  }, [authenticatedFetch, lowStockOnly, state.status]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const submitAdjustment = async () => {
    if (!selected) return;
    const parsed = Number(delta);
    if (!Number.isSafeInteger(parsed) || parsed === 0) { setError('Số lượng thay đổi phải là số nguyên khác 0.'); return; }
    try { await adjustSellerInventory(authenticatedFetch, selected.variantId, selected.version, { delta: parsed, reason, note: note.trim() || null }); setSelected(null); setDelta(''); setNote(''); await load(); }
    catch (cause) { setError(cause instanceof RoleApiError ? cause.problem?.detail ?? 'Không thể cập nhật tồn kho.' : 'Không thể cập nhật tồn kho.'); }
  };
  const showHistory = async (item: InventoryBalance) => { try { setHistory((await fetchSellerInventoryHistory(authenticatedFetch, item.variantId)).items); } catch { setError('Không thể tải lịch sử tồn kho.'); } };

  if (state.status !== 'authenticated') return <section className="operational-state"><h1>Quản lý tồn kho</h1><p>Vui lòng đăng nhập tài khoản seller để xem tồn kho.</p></section>;
  return <section className="seller-inventory-page">
    <header className="seller-inventory-heading"><div><p className="seller-inventory-eyebrow">SELLER CENTER</p><h1>Tồn kho</h1><p>Theo dõi số lượng có sẵn, đang giữ chỗ và đã bán theo từng biến thể.</p></div><label className="seller-inventory-filter"><input type="checkbox" checked={lowStockOnly} onChange={(event) => setLowStockOnly(event.target.checked)} /> Chỉ hiện sắp hết hàng</label></header>
    {loading ? <p className="seller-inventory-state">Đang tải tồn kho…</p> : error ? <div className="seller-inventory-error"><p>{error}</p><button type="button" onClick={() => void load()}>Thử lại</button></div> : items.length === 0 ? <p className="seller-inventory-state">Chưa có sản phẩm đang bán để quản lý tồn kho. Chỉ hiển thị sản phẩm đang bán; sản phẩm nháp, ẩn, lưu trữ hoặc bị xóa sẽ không xuất hiện tại đây.</p> : <><div className="seller-inventory-table-wrap"><table className="seller-inventory-table"><thead><tr><th>Sản phẩm / SKU</th><th>Trạng thái</th><th>Hiện có</th><th>Đang giữ</th><th>Đã bán</th><th>Khả dụng</th><th>Cập nhật</th><th>Thao tác</th></tr></thead><tbody>{items.map((item) => <tr key={item.variantId}><td><div className="seller-inventory-product-cell"><InventoryProductImage item={item} /><span className="seller-inventory-product-copy"><strong>{item.productName}</strong><span>{item.variantName} · {item.sku}</span></span></div></td><td>{item.lifecycle === 'active' ? 'Đang bán' : 'Tạm dừng'}</td><td>{money(item.quantityOnHand)}</td><td>{money(item.quantityReserved)}</td><td>{money(item.quantitySold)}</td><td><strong className={item.lowStock ? 'seller-inventory-low' : ''}>{money(item.availableQuantity)}</strong>{item.lowStock ? <small>Sắp hết hàng</small> : null}</td><td>{new Date(item.updatedAt).toLocaleDateString('vi-VN')}</td><td><div className="seller-inventory-row-actions"><button type="button" onClick={() => setSelected(item)}>Điều chỉnh</button><button type="button" onClick={() => void showHistory(item)}>Lịch sử</button></div></td></tr>)}</tbody></table></div>{nextCursor ? <button className="seller-inventory-load-more" type="button" onClick={() => void load(nextCursor, true)}>Tải thêm</button> : null}</>}
    {selected ? <div className="seller-inventory-modal" role="dialog" aria-modal="true" aria-labelledby="inventory-adjust-title"><div className="seller-inventory-modal__card"><h2 id="inventory-adjust-title">Điều chỉnh tồn kho</h2><p>{selected.productName} · {selected.variantName}</p><label>Thay đổi số lượng<input autoFocus inputMode="numeric" value={delta} onChange={(event) => setDelta(event.target.value.replace(/[^-\d]/g, ''))} placeholder="Ví dụ: 20 hoặc -3" /></label><label>Lý do<select value={reason} onChange={(event) => setReason(event.target.value as InventoryAdjustmentReason)}><option value="RESTOCK">Nhập thêm</option><option value="DAMAGE">Hư hỏng</option><option value="RETURN">Khách trả hàng</option><option value="CORRECTION">Điều chỉnh khác</option></select></label><label>Ghi chú (không bắt buộc)<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} /></label><div className="seller-inventory-modal__actions"><button type="button" onClick={() => setSelected(null)}>Hủy</button><button type="button" onClick={() => void submitAdjustment()}>Lưu điều chỉnh</button></div></div></div> : null}
    {history ? <div className="seller-inventory-history"><div className="seller-inventory-history__heading"><h2>Lịch sử điều chỉnh</h2><button type="button" onClick={() => setHistory(null)}>Đóng</button></div>{history.length ? <ul>{history.map((entry) => <li key={entry.id}><strong>{entry.delta > 0 ? '+' : ''}{entry.delta}</strong><span>{entry.reason} · {new Date(entry.occurredAt).toLocaleString('vi-VN')}</span><small>{entry.quantityOnHandBefore} → {entry.quantityOnHandAfter}{entry.note ? ` · ${entry.note}` : ''}</small></li>)}</ul> : <p>Chưa có lịch sử.</p>}</div> : null}
  </section>;
}
