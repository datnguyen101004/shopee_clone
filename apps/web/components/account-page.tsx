import { Card, StorefrontContainer } from '@shopee-clone/ui';
import type { ReactNode } from 'react';

export function AccountPage({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <StorefrontContainer className="account-page">
      <section className="account-page__panel" aria-labelledby="account-page-title">
        <div className="account-page__intro">
          <span>{eyebrow}</span>
          <h1 id="account-page-title">{title}</h1>
          <p>{description}</p>
        </div>
        <Card className="account-page__card">{children}</Card>
      </section>
    </StorefrontContainer>
  );
}
