'use client';

import type { ProductDetailResponse, PublicProductReviewPage } from '@shopee-clone/contracts';
import { useEffect, useState } from 'react';
import { getProductReviews } from '../../lib/reviews-api';

export function ProductReviews({ product }: { product: ProductDetailResponse }) {
  const [rating, setRating] = useState<number | null>(null);
  const [page, setPage] = useState<PublicProductReviewPage | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const load = async (next: string | null, nextRating = rating, append = false) => {
    setState('loading');
    try { const result = await getProductReviews(product.id, nextRating, next); setPage((current) => append && current ? { ...result, items: [...current.items, ...result.items] } : result); setState('ready'); } catch { setState('error'); }
  };
  useEffect(() => { void load(null, rating); }, [rating]);
  const average = (page?.summary.ratingAverageBasisPoints ?? product.ratingAverageBasisPoints) / 100;
  return <section className="product-reviews" aria-labelledby="product-reviews-title">
    <header><div><h2 id="product-reviews-title">Đánh giá sản phẩm</h2><strong>{average ? average.toFixed(1) : 'Chưa có'} ★</strong><span> {page?.summary.ratingCount ?? product.ratingCount} đánh giá</span></div><div role="tablist" aria-label="Lọc số sao">{[null, 5, 4, 3, 2, 1].map((value) => <button type="button" role="tab" aria-selected={rating === value} key={value ?? 'all'} onClick={() => setRating(value)}>{value ? `${value} sao` : 'Tất cả'}</button>)}</div></header>
    {state === 'loading' && !page ? <p aria-busy="true">Đang tải đánh giá…</p> : null}
    {state === 'error' ? <p role="alert">Chưa thể tải đánh giá. <button type="button" onClick={() => void load(null)}>Thử lại</button></p> : null}
    {state === 'ready' && page?.items.length === 0 ? <p>Chưa có đánh giá xác thực cho sản phẩm này.</p> : null}
    {page?.items.map((review) => <article key={review.id}><strong>{review.authorName}</strong><span aria-label={`${review.rating} trên 5 sao`}>{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</span><small>Đã mua hàng</small><time dateTime={review.updatedAt}>{new Date(review.updatedAt).toLocaleDateString('vi-VN')}</time>{review.text ? <p>{review.text}</p> : null}{review.media.length ? <div className="product-reviews__media">{review.media.map((media) => <a href={media.url} target="_blank" rel="noreferrer" key={media.id}><img src={media.url} alt="Ảnh đánh giá của người mua" /></a>)}</div> : null}</article>)}
    {page?.page.nextCursor ? <button type="button" disabled={state === 'loading'} onClick={() => void load(page.page.nextCursor, rating, true)}>Xem thêm đánh giá</button> : null}
  </section>;
}
