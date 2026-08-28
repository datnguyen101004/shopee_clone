export type ChatErrorCode =
  | 'invalid-chat-request'
  | 'chat-target-unavailable'
  | 'chat-self-conversation'
  | 'chat-conversation-not-found'
  | 'chat-message-idempotency-conflict'
  | 'chat-forbidden'
  | 'chat-rate-limited'
  | 'chat-mute-forbidden'
  | 'chat-block-forbidden'
  | 'chat-reply-invalid'
  | 'chat-report-invalid'
  | 'chat-report-conflict'
  | 'chat-attention-forbidden'
  | 'chat-restriction-active'
  | 'chat-unavailable';

export class ChatError extends Error {
  constructor(
    readonly code: ChatErrorCode,
    readonly status: 400 | 403 | 404 | 409 | 429 | 503,
    message: string,
    readonly fields: string[] = [],
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'ChatError';
  }
}
