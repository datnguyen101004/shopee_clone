import type { HealthResponse } from '@shopee-clone/contracts';
import { Container, PageShell } from '@shopee-clone/ui';

const webStatus: HealthResponse['status'] = 'ok';

export default function HealthPage() {
  return (
    <PageShell>
      <Container className="health-wrap">
        <p className="eyebrow">Shopee Clone Web</p>
        <h1>Health</h1>
        <p className="health-status" role="status">
          Status: {webStatus}
        </p>
      </Container>
    </PageShell>
  );
}
