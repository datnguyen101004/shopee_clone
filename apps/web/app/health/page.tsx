import type { HealthResponse } from '@shopee-clone/contracts';

const webStatus: HealthResponse['status'] = 'ok';

export default function HealthPage() {
  return (
    <main>
      <p className="eyebrow">Shopee Clone Web</p>
      <h1>Health</h1>
      <p className="health-status" role="status">
        Status: {webStatus}
      </p>
    </main>
  );
}
