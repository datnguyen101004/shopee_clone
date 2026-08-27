export const CHAT_CONFIG = Symbol('CHAT_CONFIG');
export interface ChatConfig {
  ticketTtlSeconds: number;
  presenceLeaseSeconds: number;
  outboxBatch: number;
  messageRatePerMinute: number;
  outboxReadinessMaxAgeSeconds: number;
}

function integer(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw new Error(`Invalid chat configuration: ${name}`);
  return value;
}

export function loadChatConfig(): ChatConfig {
  return {
    ticketTtlSeconds: integer('CHAT_TICKET_TTL_SECONDS', 60, 15, 300),
    presenceLeaseSeconds: integer('CHAT_PRESENCE_LEASE_SECONDS', 45, 10, 300),
    outboxBatch: integer('CHAT_OUTBOX_BATCH', 50, 1, 500),
    messageRatePerMinute: integer('CHAT_MESSAGE_RATE_PER_MINUTE', 30, 1, 600),
    outboxReadinessMaxAgeSeconds: integer('CHAT_OUTBOX_READINESS_MAX_AGE_SECONDS', 60, 5, 3_600),
  };
}
