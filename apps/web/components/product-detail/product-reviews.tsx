'use client';

import type { ProductDetailResponse, PublicProductReviewPage } from '@shopee-clone/contracts';
import { useEffect, useState } from 'react';
import { getProductReviews } from '../../lib/reviews-api';

const RATING_FILTERS = [null, 5, 4, 3, 2, 1] as const;

export function ProductReviews({ product }: { product: ProductDetailResponse }) {
  const [rating, setRating] = useState<number | null>(null);
  const [page, setPage] = useState<PublicProductReviewPage | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [reloadVersion, setReloadVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;

    void getProductReviews(product.id, rating, null)
      .then((result) => {
        if (cancelled) return;
        setPage(result);
        setState('ready');
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });

    return () => {
      cancelled = true;
    };
  }, [product.id, rating, reloadVersion]);

  const selectRating = (nextRating: number | null) => {
    if (nextRating === rating) return;
    setRating(nextRating);
    setPage(null);
    setState('loading');
  };

  const retry = () => {
    setState('loading');
    setReloadVersion((current) => current + 1);
  };

  const loadMore = async () => {
    if (!page?.page.nextCursor) return;
    setState('loading');
    try {
      const result = await getProductReviews(product.id, rating, page.page.nextCursor);
      setPage((current) =>
        current ? { ...result, items: [...current.items, ...result.items] } : result,
      );
      setState('ready');
    } catch {
      setState('error');
    }
  };

  const average =
    (page?.summary.ratingAverageBasisPoints ?? product.ratingAverageBasisPoints) / 100;

  return (
    <section className="product-reviews" aria-labelledby="product-reviews-title">
      <header>
        <div>
          <h2 id="product-reviews-title">Đánh giá sản phẩm</h2>
          <strong>{average ? average.toFixed(1) : 'Chưa có'} ★</strong>
          <span> {page?.summary.ratingCount ?? product.ratingCount} đánh giá</span>
        </div>
        <div role="tablist" aria-label="Lọc số sao">
          {RATING_FILTERS.map((value) => (
            <button
              type="button"
              role="tab"
              aria-selected={rating === value}
              key={value ?? 'all'}
              onClick={() => selectRating(value)}
            >
              {value ? `${value} sao` : 'Tất cả'}
            </button>
          ))}
        </div>
      </header>

      {state === 'loading' && !page ? <p aria-busy="true">Đang tải đánh giá…</p> : null}
      {state === 'error' ? (
        <p role="alert">
          Chưa thể tải đánh giá.{' '}
          <button type="button" onClick={retry}>
            Thử lại
          </button>
        </p>
      ) : null}
      {state === 'ready' && page?.items.length === 0 ? (
        <p>Chưa có đánh giá xác thực cho sản phẩm này.</p>
      ) : null}

      {page?.items.map((review) => (
        <article key={review.id}>
          <strong>{review.authorName}</strong>
          <span aria-label={`${review.rating} trên 5 sao`}>
            {'★'.repeat(review.rating)}
            {'☆'.repeat(5 - review.rating)}
          </span>
          <small>Đã mua hàng</small>
          <time dateTime={review.updatedAt}>
            {new Date(review.updatedAt).toLocaleDateString('vi-VN')}
          </time>
          {review.text ? <p>{review.text}</p> : null}
          {review.media.length ? (
            <div className="product-reviews__media">
              {review.media.map((media) => (
                <a href={media.url} target="_blank" rel="noreferrer" key={media.id}>
                  <img src={media.url} alt="Ảnh đánh giá của người mua" />
                </a>
              ))}
            </div>
          ) : null}
        </article>
      ))}

      {page?.page.nextCursor ? (
        <button type="button" disabled={state === 'loading'} onClick={() => void loadMore()}>
          Xem thêm đánh giá
        </button>
      ) : null}
    </section>
  );
}
