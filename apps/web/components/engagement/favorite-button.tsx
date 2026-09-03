'use client';

import { useFavoriteState } from './favorite-state-provider';

export function FavoriteButton({
  productId,
  compact = false,
}: {
  productId: string;
  compact?: boolean;
}) {
  const favorite = useFavoriteState(productId);
  const label = favorite.isFavorite ? 'Bỏ khỏi yêu thích' : 'Thêm vào yêu thích';

  function activate() {
    if (!favorite.authenticated) {
      const returnTo = `${window.location.pathname}${window.location.search}`;
      window.history.pushState(null, '', `/login?returnTo=${encodeURIComponent(returnTo)}`);
      return;
    }
    void favorite.toggle(productId);
  }

  return (
    <div className={`favorite-control${compact ? ' favorite-control--compact' : ''}`}>
      <button
        type="button"
        aria-label={favorite.authenticated ? label : 'Đăng nhập để thêm vào yêu thích'}
        aria-pressed={favorite.authenticated ? favorite.isFavorite : false}
        disabled={favorite.pending}
        onClick={activate}
      >
        <span aria-hidden="true">{favorite.isFavorite ? '♥' : '♡'}</span>
        {!compact ? <span>{favorite.pending ? 'Đang lưu…' : label}</span> : null}
      </button>
      {favorite.error ? (
        <span className="favorite-control__error" role="alert">
          {favorite.error}
        </span>
      ) : null}
    </div>
  );
}
