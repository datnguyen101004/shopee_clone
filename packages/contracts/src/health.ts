export type HealthResponse = {
  status: 'ok';
  service: 'api';
  timestamp: string;
};

export function isHealthResponse(value: unknown): value is HealthResponse {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const timestamp = candidate.timestamp;

  return (
    candidate.status === 'ok' &&
    candidate.service === 'api' &&
    typeof timestamp === 'string' &&
    !Number.isNaN(Date.parse(timestamp)) &&
    new Date(timestamp).toISOString() === timestamp
  );
}
