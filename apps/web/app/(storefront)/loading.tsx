import { Container } from '@shopee-clone/ui';

export default function HomepageLoading() {
  return (
    <Container className="homepage-loading" aria-label="Đang tải nội dung mua sắm" aria-busy="true">
      <span className="homepage-skeleton homepage-skeleton--hero" />
      <span className="homepage-skeleton homepage-skeleton--line" />
      <div className="homepage-skeleton-grid">
        {Array.from({ length: 6 }, (_, index) => (
          <span className="homepage-skeleton" key={index} />
        ))}
      </div>
    </Container>
  );
}
