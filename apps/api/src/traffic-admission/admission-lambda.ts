/**
 * Lambda-compatible SQS Standard handler contract used by the LocalStack POC.
 * The Nest service supplies the Redis atomic grant function in production or
 * in the local worker. Returning a batch item failure keeps a WAITING ticket
 * visible for bounded SQS redelivery when all leases are occupied.
 */
export interface AdmissionSqsRecord {
  messageId?: string;
  body?: string;
}

export interface AdmissionLambdaEvent {
  Records?: AdmissionSqsRecord[];
}

export interface AdmissionLambdaResult {
  batchItemFailures: Array<{ itemIdentifier: string }>;
}

export type AdmissionGrantResult = 'GRANTED' | 'WAITING' | 'TERMINAL';

export async function handleAdmissionQueueEvent(
  event: AdmissionLambdaEvent,
  grant: (ticketId: string, gateId: string) => Promise<AdmissionGrantResult>,
): Promise<AdmissionLambdaResult> {
  const failures: Array<{ itemIdentifier: string }> = [];
  for (const record of event.Records ?? []) {
    const messageId = record.messageId ?? 'unknown-message';
    let body: { ticketId?: string; gateId?: string };
    try {
      body = JSON.parse(record.body ?? '{}') as { ticketId?: string; gateId?: string };
    } catch {
      // A malformed message is terminal input; retrying it forever would block
      // unrelated tickets in the Standard queue.
      continue;
    }
    if (!body.ticketId || !body.gateId) continue;
    try {
      const result = await grant(body.ticketId, body.gateId);
      if (result === 'WAITING') failures.push({ itemIdentifier: messageId });
    } catch {
      failures.push({ itemIdentifier: messageId });
    }
  }
  return { batchItemFailures: failures };
}
