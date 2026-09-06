import Link from 'next/link';
import type { ReactNode } from 'react';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    parts.length > 1 ? `${parts[0]?.[0] ?? ''}${parts.at(-1)?.[0] ?? ''}` : name.slice(0, 2)
  ).toUpperCase();
}

export function AdminEntityLink({
  href,
  name,
  imageUrl,
  meta,
  fallbackIcon,
}: {
  href: string;
  name: string;
  imageUrl?: string | null;
  meta?: ReactNode;
  fallbackIcon?: ReactNode;
}) {
  return (
    <Link href={href} className="admin-entity-link" title={`Mở quản lý ${name}`}>
      <span className="admin-entity-link__media" aria-hidden="true">
        {imageUrl ? <img src={imageUrl} alt="" /> : (fallbackIcon ?? <span>{initials(name)}</span>)}
      </span>
      <span className="admin-entity-link__copy">
        <strong>{name}</strong>
        {meta ? <small>{meta}</small> : null}
      </span>
    </Link>
  );
}
