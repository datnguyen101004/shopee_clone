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

  const basisPoints =
    page?.summary.ratingAverageBasisPoints || product.ratingAverageBasisPoints;
  const ratingCount = page?.summary.ratingCount ?? product.ratingCount;
  const hasReviews = ratingCount > 0 || basisPoints > 0;
  const ratingAverage = hasReviews ? (basisPoints / 100).toFixed(1) : null;
  const starScore = ratingAverage ? Math.max(1, Math.min(5, Math.round(Number(ratingAverage)))) : 0;

  return (
    <section className="product-reviews" aria-labelledby="product-reviews-title">
      <header className="product-reviews__header">
        <div className="product-reviews__summary">
          <div className="product-detail-section-heading">
            <span className="product-detail-section-heading__bar" aria-hidden="true"></span>
            <h2 id="product-reviews-title">Đánh giá sản phẩm</h2>
          </div>
          <div className="product-reviews__score-box">
            {hasReviews && ratingAverage ? (
              <>
                <div className="product-reviews__score-main">
                  <strong>{ratingAverage}</strong>
                  <span>trên 5</span>
                  <div className="product-reviews__stars-banner" aria-hidden="true">
                    {'★'.repeat(starScore)}
                    {'☆'.repeat(5 - starScore)}
                  </div>
                </div>
                <div className="product-reviews__count-label">
                  <span>{ratingCount} đánh giá</span>
                </div>
              </>
            ) : (
              <div className="product-reviews__score-empty">
                <span className="product-reviews__score-empty-text">Chưa có đánh giá</span>
              </div>
            )}
          </div>
        </div>
        <div role="tablist" aria-label="Lọc số sao" className="product-reviews__filters">
          {RATING_FILTERS.map((value) => (
            <button
              type="button"
              role="tab"
              aria-selected={rating === value}
              className={`product-reviews__tab-btn${rating === value ? ' is-active' : ''}`}
              key={value ?? 'all'}
              onClick={() => selectRating(value)}
            >
              {value ? `${value} sao` : 'Tất cả'}
            </button>
          ))}
        </div>
      </header>

      {state === 'loading' && !page ? (
        <div className="product-reviews__loading" aria-busy="true">
          <div className="product-reviews__spinner" aria-hidden="true"></div>
          <p>Đang tải đánh giá…</p>
        </div>
      ) : null}

      {state === 'error' ? (
        <div className="product-reviews__alert" role="alert">
          <p>
            Chưa thể tải đánh giá.{' '}
            <button type="button" className="product-reviews__retry-btn" onClick={retry}>
              Thử lại
            </button>
          </p>
        </div>
      ) : null}

      {state === 'ready' && page?.items.length === 0 ? (
        <div className="product-reviews__empty">
          <p>Chưa có đánh giá xác thực cho sản phẩm này.</p>
        </div>
      ) : null}

      <div className="product-reviews__list">
        {page?.items.map((review) => (
          <article key={review.id} className="product-reviews__item">
            <div className="product-reviews__item-avatar" aria-hidden="true">
              {review.authorName.charAt(0).toUpperCase()}
            </div>
            <div className="product-reviews__item-content">
              <div className="product-reviews__item-meta">
                <strong className="product-reviews__author">{review.authorName}</strong>
                <span className="product-reviews__stars" aria-label={`${review.rating} trên 5 sao`}>
                  {'★'.repeat(review.rating)}
                  {'☆'.repeat(5 - review.rating)}
                </span>
                <span className="product-reviews__verified-tag">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <small>Đã mua hàng</small>
                </span>
                <time dateTime={review.updatedAt} className="product-reviews__time">
                  {new Date(review.updatedAt).toLocaleDateString('vi-VN')}
                </time>
              </div>
              {review.text ? <p className="product-reviews__text">{review.text}</p> : null}
              {review.media.length ? (
                <div className="product-reviews__media">
                  {review.media.map((media) => (
                    <a href={media.url} target="_blank" rel="noreferrer" key={media.id} className="product-reviews__media-thumb">
                      <img src={media.url} alt="Ảnh đánh giá của người mua" />
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
          </article>
        ))}
      </div>

      {page?.page.nextCursor ? (
        <div className="product-reviews__more-wrapper">
          <button
            type="button"
            className="product-reviews__load-more-btn"
            disabled={state === 'loading'}
            onClick={() => void loadMore()}
          >
            {state === 'loading' ? 'Đang tải thêm…' : 'Xem thêm đánh giá'}
          </button>
        </div>
      ) : null}
    </section>
  );
}
