import {
  parseChatConversationListResponse,
  parseChatMessagePage,
  parseChatUnreadCountResponse,
  parseMarkChatReadResponse,
  parseChatRealtimeTicketResponse,
  parseChatTargetResponse,
  parseChatProblemDetails,
  parseChatAttentionResponse,
  parseChatConversationActionResponse,
  parseChatReportReceipt,
  parseSendChatMessageResponse,
  type ChatConversationListResponse,
  type ChatMessagePage,
  type ChatRealtimeTicketResponse,
  type ChatTargetResponse,
  type ChatAttentionRequest,
  type ChatConversationActionResponse,
  type ChatReportReceipt,
  type SendChatMessageRequest,
  type SendChatMessageResponse,
} from '@shopee-clone/contracts';
import type { AuthenticatedFetch } from './account-api';

const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';
const endpoint = (path: string) => new URL(path, base);

export class ChatApiError extends Error {
  constructor(readonly kind: 'transport' | 'status' | 'contract' | 'input', readonly status = 0, readonly problem: ReturnType<typeof parseChatProblemDetails> = null) {
    super(`Chat API ${kind} error`);
    this.name = 'ChatApiError';
  }
}

async function request(path: string, init: RequestInit, fetcher: AuthenticatedFetch): Promise<unknown> {
  let response: Response;
  try {
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json, application/problem+json');
    if (init.body) headers.set('Content-Type', 'application/json');
    response = await fetcher(endpoint(path), { ...init, headers, cache: 'no-store' });
  } catch { throw new ChatApiError('transport'); }
  if (!response.ok) {
    let body: unknown = null;
    try { body = await response.json(); } catch { /* ignore malformed status body */ }
    throw new ChatApiError('status', response.status, parseChatProblemDetails(body));
  }
  try { return await response.json(); } catch { throw new ChatApiError('contract', response.status); }
}

function parsed<T>(value: unknown, parser: (value: unknown) => T | null): T {
  const result = parser(value);
  if (!result) throw new ChatApiError('contract');
  return result;
}

export async function getChatTarget(shopId: string, fetcher: AuthenticatedFetch): Promise<ChatTargetResponse> {
  return parsed(await request(`/api/v1/chat/targets/shops/${encodeURIComponent(shopId)}`, { method: 'GET' }, fetcher), parseChatTargetResponse);
}

export async function listChatConversations(params: { limit?: number; cursor?: string | null; query?: string } = {}, fetcher: AuthenticatedFetch): Promise<ChatConversationListResponse> {
  const query = new URLSearchParams();
  if (params.limit) query.set('limit', String(params.limit));
  if (params.cursor) query.set('cursor', params.cursor);
  if (params.query) query.set('query', params.query);
  return parsed(await request(`/api/v1/chat/conversations?${query.toString()}`, { method: 'GET' }, fetcher), parseChatConversationListResponse);
}

export async function getChatMessages(conversationId: string, params: { limit?: number; beforeSequence?: number; afterSequence?: number } = {}, fetcher: AuthenticatedFetch): Promise<ChatMessagePage> {
  const query = new URLSearchParams();
  if (params.limit) query.set('limit', String(params.limit));
  if (params.beforeSequence) query.set('beforeSequence', String(params.beforeSequence));
  if (params.afterSequence) query.set('afterSequence', String(params.afterSequence));
  return parsed(await request(`/api/v1/chat/conversations/${encodeURIComponent(conversationId)}/messages?${query.toString()}`, { method: 'GET' }, fetcher), parseChatMessagePage);
}

export async function getChatUnreadCount(fetcher: AuthenticatedFetch) {
  const response = parsed(await request('/api/v1/chat/conversations/unread-count', { method: 'GET' }, fetcher), parseChatUnreadCountResponse);
  return response.unreadCount;
}

export async function sendChatMessage(input: SendChatMessageRequest, fetcher: AuthenticatedFetch): Promise<SendChatMessageResponse> {
  return parsed(await request('/api/v1/chat/messages', { method: 'POST', body: JSON.stringify(input) }, fetcher), parseSendChatMessageResponse);
}

export async function muteChatConversation(
  conversationId: string,
  fetcher: AuthenticatedFetch,
): Promise<ChatConversationActionResponse> {
  return parsed(
    await request(`/api/v1/chat/conversations/${encodeURIComponent(conversationId)}/mute`, { method: 'PUT' }, fetcher),
    parseChatConversationActionResponse,
  );
}

export async function unmuteChatConversation(
  conversationId: string,
  fetcher: AuthenticatedFetch,
): Promise<ChatConversationActionResponse> {
  return parsed(
    await request(`/api/v1/chat/conversations/${encodeURIComponent(conversationId)}/mute`, { method: 'DELETE' }, fetcher),
    parseChatConversationActionResponse,
  );
}

export async function blockChatUser(
  userId: string,
  fetcher: AuthenticatedFetch,
): Promise<ChatConversationActionResponse> {
  return parsed(
    await request(`/api/v1/chat/users/${encodeURIComponent(userId)}/block`, { method: 'PUT' }, fetcher),
    parseChatConversationActionResponse,
  );
}

export async function unblockChatUser(
  userId: string,
  fetcher: AuthenticatedFetch,
): Promise<ChatConversationActionResponse> {
  return parsed(
    await request(`/api/v1/chat/users/${encodeURIComponent(userId)}/block`, { method: 'DELETE' }, fetcher),
    parseChatConversationActionResponse,
  );
}

export async function updateChatAttention(
  conversationId: string,
  input: ChatAttentionRequest,
  fetcher: AuthenticatedFetch,
) {
  return parsed(
    await request(`/api/v1/chat/conversations/${encodeURIComponent(conversationId)}/attention`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }, fetcher),
    parseChatAttentionResponse,
  );
}

export async function reportChat(
  input: { conversationId: string; messageId?: string | null; reasonCode: string; details?: string | null },
  idempotencyKey: string,
  fetcher: AuthenticatedFetch,
): Promise<ChatReportReceipt> {
  return parsed(
    await request('/api/v1/chat/reports', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(input),
    }, fetcher),
    parseChatReportReceipt,
  );
}

export async function markChatRead(conversationId: string, throughSequence: number, fetcher: AuthenticatedFetch) {
  return parsed(await request(`/api/v1/chat/conversations/${encodeURIComponent(conversationId)}/read`, { method: 'PUT', body: JSON.stringify({ throughSequence }) }, fetcher), parseMarkChatReadResponse);
}

export async function createChatRealtimeTicket(fetcher: AuthenticatedFetch): Promise<ChatRealtimeTicketResponse> {
  return parsed(await request('/api/v1/chat/realtime-ticket', { method: 'POST' }, fetcher), parseChatRealtimeTicketResponse);
}
