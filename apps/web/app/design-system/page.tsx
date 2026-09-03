import { Container, PageShell } from '@shopee-clone/ui';
import Link from 'next/link';

import { DesignSystemShowcase } from './showcase';

export default function DesignSystemPage() {
  return (
    <PageShell
      header={
        <Container className="showcase-header">
          <Link href="/">← Marketplace</Link>
          <strong>Design System</strong>
          <span>v0.1</span>
        </Container>
      }
    >
      <Container className="showcase-page">
        <header className="showcase-intro">
          <p>SHOPEE CLONE UI</p>
          <h1>Nền tảng giao diện marketplace</h1>
          <span>Token, component và trạng thái responsive dùng chung cho toàn bộ sản phẩm.</span>
        </header>
        <DesignSystemShowcase />
      </Container>
    </PageShell>
  );
}
