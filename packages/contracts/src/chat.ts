/** Framework-neutral contracts for the floating user-to-user text chat. */

export const CHAT_VERSION = 'chat-v1' as const;
export const CHAT_MESSAGE_MAX_LENGTH = 2_000;
export const CHAT_DEFAULT_LIMIT = 20;
export const CHAT_MAX_LIMIT = 50;
export const CHAT_CONTACT_SEARCH_MAX_LENGTH = 80;
export const CHAT_REALTIME_TICKET_TTL_SECONDS = 60;
export const CHAT_REPLY_PREVIEW_MAX_LENGTH = 160;
export const CHAT_REPORT_DETAILS_MAX_LENGTH = 1_000;
export const CHAT_ATTENTION_LEASE_SECONDS = 15;

export const CHAT_PRESENCE_STATES = ['ACTIVE', 'INACTIVE'] as const;
export type ChatPresence = (typeof CHAT_PRESENCE_STATES)[number];

export const CHAT_EVENT_TYPES = [
  'chat.message.accepted',
  'chat.conversation.updated',
  'chat.read.updated',
  'chat.unread.updated',
  'chat.presence.updated',
  'chat.safety.updated',
  'chat.notification.updated',
] as const;
export type ChatEventType = (typeof CHAT_EVENT_TYPES)[number];

export type ChatMessageDeliveryState = 'SENT' | 'PENDING' | 'FAILED';

export interface ChatTargetResponse {
  chatVersion: typeof CHAT_VERSION;
  shopId: string;
  shopName: string;
  ownerUserId: string;
  ownerDisplayName: string;
  ownerAvatarUrl: string | null;
  isSelf: boolean;
  canMessage?: boolean;
  /** Authorized existing conversation for this user/shop pair, when materialized. */
  existingConversation?: ChatConversationSummary | null;
}

export interface ChatParticipant {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  presence: ChatPresence;
}

export interface ChatConversationSummary {
  id: string;
  participant: ChatParticipant;
  /** Display label for a marketplace shop; falls back to participant.displayName for user chats. */
  shopName?: string | null;
  lastMessagePreview: string;
  lastMessageAt: string;
  unreadCount: number;
  lastReadSequence: number;
  lastMessageSequence: number;
  /** Generic eligibility flag; omitted by older clients and treated as true. */
  canMessage?: boolean;
  notificationsMuted?: boolean;
  blockedByMe?: boolean;
}

export interface ChatReplyReference {
  messageId: string;
  sequence: number;
  senderUserId: string;
  senderLabel: string;
  preview: string;
}

export interface ChatConversationListResponse {
  chatVersion: typeof CHAT_VERSION;
  items: ChatConversationSummary[];
  nextCursor: string | null;
  unreadCount: number;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  sequence: number;
  senderUserId: string;
  clientMessageId: string;
  content: string;
  createdAt: string;
  deliveryState: ChatMessageDeliveryState;
  isRead: boolean;
  replyTo?: ChatReplyReference | null;
}

export interface ChatMessagePage {
  chatVersion: typeof CHAT_VERSION;
  conversation: ChatConversationSummary;
  items: ChatMessage[];
  hasMoreBefore: boolean;
  hasMoreAfter: boolean;
  unreadCount: number;
}

export interface SendChatMessageRequest {
  recipientUserId: string;
  clientMessageId: string;
  content: string;
  replyToMessageId?: string | null;
}

export interface SendChatMessageResponse {
  chatVersion: typeof CHAT_VERSION;
  conversation: ChatConversationSummary;
  message: ChatMessage;
}

export interface MarkChatReadRequest {
  throughSequence: number;
}

export interface MarkChatReadResponse {
  chatVersion: typeof CHAT_VERSION;
  conversationId: string;
  throughSequence: number;
  unreadCount: number;
  unreadTotal: number;
  readAt: string;
}

export interface ChatUnreadCountResponse {
  chatVersion: typeof CHAT_VERSION;
  unreadCount: number;
}

export interface ChatConversationActionResponse {
  chatVersion: typeof CHAT_VERSION;
  conversationId: string;
  notificationsMuted: boolean;
  blockedByMe: boolean;
  canMessage: boolean;
}

export interface ChatAttentionRequest {
  clientInstanceId: string;
  engagedAtNewestRegion: boolean;
}

export interface ChatAttentionResponse {
  chatVersion: typeof CHAT_VERSION;
  conversationId: string;
  clientInstanceId: string;
  expiresAt: string | null;
}

export const CHAT_REPORT_REASON_CODES = [
  'INAPPROPRIATE_CONTENT',
  'HARASSMENT',
  'SPAM',
  'SCAM',
  'OTHER',
] as const;
export type ChatReportReasonCode = (typeof CHAT_REPORT_REASON_CODES)[number];

export interface ChatReportRequest {
  conversationId: string;
  messageId?: string | null;
  reasonCode: ChatReportReasonCode;
  details?: string | null;
}

export interface ChatReportReceipt {
  id: string;
  conversationId: string;
  messageId: string | null;
  reasonCode: ChatReportReasonCode;
  status: 'SUBMITTED' | 'REVIEWED';
  createdAt: string;
}

export interface ChatOutboxHealthResponse {
  ready: boolean;
  pending: number;
  processing: number;
  failed: number;
  oldestPendingAgeSeconds: number | null;
  claimed: number;
  sent: number;
  failedAttempts: number;
  polls: number;
  lastPollAt: string | null;
  lastErrorAt: string | null;
}

export interface ChatRealtimeTicketResponse {
  chatVersion: typeof CHAT_VERSION;
  ticket: string;
  expiresAt: string;
}

export interface ChatMessageAcceptedEvent {
  eventVersion: typeof CHAT_VERSION;
  type: 'chat.message.accepted';
  message: ChatMessage;
  conversation: ChatConversationSummary;
  unreadTotal: number;
}

export interface ChatConversationUpdatedEvent {
  eventVersion: typeof CHAT_VERSION;
  type: 'chat.conversation.updated';
  conversation: ChatConversationSummary;
}

export interface ChatReadUpdatedEvent {
  eventVersion: typeof CHAT_VERSION;
  type: 'chat.read.updated';
  conversationId: string;
  userId: string;
  throughSequence: number;
  unreadCount: number;
  unreadTotal: number;
}

export interface ChatUnreadUpdatedEvent {
  eventVersion: typeof CHAT_VERSION;
  type: 'chat.unread.updated';
  conversationId: string;
  unreadCount: number;
  unreadTotal: number;
}

export interface ChatPresenceUpdatedEvent {
  eventVersion: typeof CHAT_VERSION;
  type: 'chat.presence.updated';
  userId: string;
  presence: ChatPresence;
}

export interface ChatSafetyUpdatedEvent {
  eventVersion: typeof CHAT_VERSION;
  type: 'chat.safety.updated';
  conversation: ChatConversationSummary;
}

export interface ChatNotificationUpdatedEvent {
  eventVersion: typeof CHAT_VERSION;
  type: 'chat.notification.updated';
  conversationId: string;
  notificationUnreadCount: number;
}

export type ChatRealtimeEvent =
  | ChatMessageAcceptedEvent
  | ChatConversationUpdatedEvent
  | ChatReadUpdatedEvent
  | ChatUnreadUpdatedEvent
  | ChatPresenceUpdatedEvent
  | ChatSafetyUpdatedEvent
  | ChatNotificationUpdatedEvent;

export interface ChatProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  code?: string;
  errors?: Array<{ field: string; message: string }>;
  retryAfterSeconds?: number;
  validation?: unknown;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const problemType = /^https:\/\/shopee-clone\.local\/problems\/[a-z0-9-]+$/;
const problemStatuses = new Set([400, 401, 403, 404, 409, 429, 503]);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function hasExactKeys(value: Record<string, unknown>, required: string[], optional: string[] = []) {
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key))
  );
}

function isDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function isSafeInt(value: unknown, minimum = 0): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
}

function isText(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

export function isChatPresence(value: unknown): value is ChatPresence {
  return typeof value === 'string' && (CHAT_PRESENCE_STATES as readonly string[]).includes(value);
}

export function isChatMessage(value: unknown): value is ChatMessage {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'id',
      'conversationId',
      'sequence',
      'senderUserId',
      'clientMessageId',
      'content',
      'createdAt',
      'deliveryState',
      'isRead',
    ], ['replyTo'])
  )
    return false;
  return (
    uuid.test(String(value.id)) &&
    uuid.test(String(value.conversationId)) &&
    isSafeInt(value.sequence, 1) &&
    uuid.test(String(value.senderUserId)) &&
    uuid.test(String(value.clientMessageId)) &&
    isText(value.content, CHAT_MESSAGE_MAX_LENGTH) &&
    isDate(value.createdAt) &&
    ['SENT', 'PENDING', 'FAILED'].includes(String(value.deliveryState)) &&
    typeof value.isRead === 'boolean' &&
    (value.replyTo === undefined || value.replyTo === null || isChatReplyReference(value.replyTo))
  );
}

export function isChatReplyReference(value: unknown): value is ChatReplyReference {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['messageId', 'sequence', 'senderUserId', 'senderLabel', 'preview']) &&
    uuid.test(String(value.messageId)) &&
    isSafeInt(value.sequence, 1) &&
    uuid.test(String(value.senderUserId)) &&
    isText(value.senderLabel, 120) &&
    typeof value.preview === 'string' &&
    value.preview.length <= CHAT_REPLY_PREVIEW_MAX_LENGTH
  );
}

export function isChatParticipant(value: unknown): value is ChatParticipant {
  if (!isRecord(value) || !hasExactKeys(value, ['userId', 'displayName', 'avatarUrl', 'presence']))
    return false;
  return (
    uuid.test(String(value.userId)) &&
    isText(value.displayName, 120) &&
    (value.avatarUrl === null || typeof value.avatarUrl === 'string') &&
    isChatPresence(value.presence)
  );
}

export function isChatConversationSummary(value: unknown): value is ChatConversationSummary {
  if (
    !isRecord(value) ||
    !hasExactKeys(
      value,
      [
        'id',
        'participant',
        'lastMessagePreview',
        'lastMessageAt',
        'unreadCount',
        'lastReadSequence',
        'lastMessageSequence',
      ],
      ['shopName', 'canMessage', 'notificationsMuted', 'blockedByMe'],
    )
  )
    return false;
  return (
    uuid.test(String(value.id)) &&
    isChatParticipant(value.participant) &&
    (value.shopName === undefined || value.shopName === null || isText(value.shopName, 160)) &&
    (value.canMessage === undefined || typeof value.canMessage === 'boolean') &&
    (value.notificationsMuted === undefined || typeof value.notificationsMuted === 'boolean') &&
    (value.blockedByMe === undefined || typeof value.blockedByMe === 'boolean') &&
    typeof value.lastMessagePreview === 'string' &&
    value.lastMessagePreview.length <= CHAT_MESSAGE_MAX_LENGTH &&
    isDate(value.lastMessageAt) &&
    isSafeInt(value.unreadCount) &&
    isSafeInt(value.lastReadSequence) &&
    isSafeInt(value.lastMessageSequence)
  );
}

export function isChatProblemDetails(value: unknown): value is ChatProblemDetails {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['type', 'title', 'status', 'detail'], ['code', 'errors', 'retryAfterSeconds', 'validation'])
  )
    return false;
  return (
    typeof value.type === 'string' &&
    problemType.test(value.type) &&
    typeof value.title === 'string' &&
    value.title.length > 0 &&
    typeof value.status === 'number' &&
    problemStatuses.has(value.status) &&
    typeof value.detail === 'string' &&
    value.detail.length > 0 &&
    (value.retryAfterSeconds === undefined || isSafeInt(value.retryAfterSeconds, 1))
  );
}

export function isSendChatMessageRequest(value: unknown): value is SendChatMessageRequest {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['recipientUserId', 'clientMessageId', 'content'], ['replyToMessageId']) &&
    uuid.test(String(value.recipientUserId)) &&
    uuid.test(String(value.clientMessageId)) &&
    isText(value.content, CHAT_MESSAGE_MAX_LENGTH) &&
    (value.replyToMessageId === undefined || value.replyToMessageId === null || uuid.test(String(value.replyToMessageId)))
  );
}

export function parseSendChatMessageRequest(value: unknown): SendChatMessageRequest | null {
  return isSendChatMessageRequest(value) ? value : null;
}

export function parseMarkChatReadRequest(value: unknown): MarkChatReadRequest | null {
  return isRecord(value) &&
    hasExactKeys(value, ['throughSequence']) &&
    isSafeInt(value.throughSequence, 1)
    ? { throughSequence: value.throughSequence }
    : null;
}

export function parseChatTargetResponse(value: unknown): ChatTargetResponse | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(
      value,
      [
        'chatVersion',
        'shopId',
        'shopName',
        'ownerUserId',
        'ownerDisplayName',
        'ownerAvatarUrl',
        'isSelf',
      ],
      ['canMessage', 'existingConversation'],
    )
  )
    return null;
  const canMessage = value.canMessage === undefined ? true : value.canMessage;
  const existingConversation =
    value.existingConversation === undefined ? null : value.existingConversation;
  return value.chatVersion === CHAT_VERSION &&
    uuid.test(String(value.shopId)) &&
    isText(value.shopName, 160) &&
    uuid.test(String(value.ownerUserId)) &&
    isText(value.ownerDisplayName, 120) &&
    (value.ownerAvatarUrl === null || typeof value.ownerAvatarUrl === 'string') &&
    typeof value.isSelf === 'boolean' &&
    typeof canMessage === 'boolean' &&
    (existingConversation === null || isChatConversationSummary(existingConversation))
    ? ({ ...value, canMessage, existingConversation } as unknown as ChatTargetResponse)
    : null;
}

export function parseChatOutboxHealthResponse(value: unknown): ChatOutboxHealthResponse | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'ready',
      'pending',
      'processing',
      'failed',
      'oldestPendingAgeSeconds',
      'claimed',
      'sent',
      'failedAttempts',
      'polls',
      'lastPollAt',
      'lastErrorAt',
    ])
  )
    return null;
  const validDateOrNull = (candidate: unknown) => candidate === null || isDate(candidate);
  const validAge =
    value.oldestPendingAgeSeconds === null ||
    (typeof value.oldestPendingAgeSeconds === 'number' &&
      Number.isSafeInteger(value.oldestPendingAgeSeconds) &&
      value.oldestPendingAgeSeconds >= 0);
  return typeof value.ready === 'boolean' &&
    isSafeInt(value.pending) &&
    isSafeInt(value.processing) &&
    isSafeInt(value.failed) &&
    validAge &&
    isSafeInt(value.claimed) &&
    isSafeInt(value.sent) &&
    isSafeInt(value.failedAttempts) &&
    isSafeInt(value.polls) &&
    validDateOrNull(value.lastPollAt) &&
    validDateOrNull(value.lastErrorAt)
    ? (value as unknown as ChatOutboxHealthResponse)
    : null;
}

export function parseChatMessagePage(value: unknown): ChatMessagePage | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'chatVersion',
      'conversation',
      'items',
      'hasMoreBefore',
      'hasMoreAfter',
      'unreadCount',
    ])
  )
    return null;
  return value.chatVersion === CHAT_VERSION &&
    isChatConversationSummary(value.conversation) &&
    Array.isArray(value.items) &&
    value.items.every(isChatMessage) &&
    typeof value.hasMoreBefore === 'boolean' &&
    typeof value.hasMoreAfter === 'boolean' &&
    isSafeInt(value.unreadCount)
    ? (value as unknown as ChatMessagePage)
    : null;
}

export function parseChatConversationListResponse(
  value: unknown,
): ChatConversationListResponse | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['chatVersion', 'items', 'nextCursor', 'unreadCount'])
  )
    return null;
  return value.chatVersion === CHAT_VERSION &&
    Array.isArray(value.items) &&
    value.items.every(isChatConversationSummary) &&
    (value.nextCursor === null || typeof value.nextCursor === 'string') &&
    isSafeInt(value.unreadCount)
    ? (value as unknown as ChatConversationListResponse)
    : null;
}

export function parseSendChatMessageResponse(value: unknown): SendChatMessageResponse | null {
  if (!isRecord(value) || !hasExactKeys(value, ['chatVersion', 'conversation', 'message']))
    return null;
  return value.chatVersion === CHAT_VERSION &&
    isChatConversationSummary(value.conversation) &&
    isChatMessage(value.message)
    ? (value as unknown as SendChatMessageResponse)
    : null;
}

export function parseChatUnreadCountResponse(value: unknown): ChatUnreadCountResponse | null {
  if (!isRecord(value) || !hasExactKeys(value, ['chatVersion', 'unreadCount'])) return null;
  return value.chatVersion === CHAT_VERSION && isSafeInt(value.unreadCount)
    ? (value as unknown as ChatUnreadCountResponse)
    : null;
}

export function parseMarkChatReadResponse(value: unknown): MarkChatReadResponse | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'chatVersion',
      'conversationId',
      'throughSequence',
      'unreadCount',
      'unreadTotal',
      'readAt',
    ])
  )
    return null;
  return value.chatVersion === CHAT_VERSION &&
    uuid.test(String(value.conversationId)) &&
    isSafeInt(value.throughSequence) &&
    isSafeInt(value.unreadCount) &&
    isSafeInt(value.unreadTotal) &&
    isDate(value.readAt)
    ? (value as unknown as MarkChatReadResponse)
    : null;
}

export function parseChatRealtimeTicketResponse(value: unknown): ChatRealtimeTicketResponse | null {
  if (!isRecord(value) || !hasExactKeys(value, ['chatVersion', 'ticket', 'expiresAt'])) return null;
  return value.chatVersion === CHAT_VERSION && isText(value.ticket, 4096) && isDate(value.expiresAt)
    ? (value as unknown as ChatRealtimeTicketResponse)
    : null;
}

export function isChatConversationActionResponse(
  value: unknown,
): value is ChatConversationActionResponse {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      'chatVersion',
      'conversationId',
      'notificationsMuted',
      'blockedByMe',
      'canMessage',
    ]) &&
    value.chatVersion === CHAT_VERSION &&
    uuid.test(String(value.conversationId)) &&
    typeof value.notificationsMuted === 'boolean' &&
    typeof value.blockedByMe === 'boolean' &&
    typeof value.canMessage === 'boolean'
  );
}

export function parseChatConversationActionResponse(
  value: unknown,
): ChatConversationActionResponse | null {
  return isChatConversationActionResponse(value) ? value : null;
}

export function isChatAttentionResponse(value: unknown): value is ChatAttentionResponse {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['chatVersion', 'conversationId', 'clientInstanceId', 'expiresAt']) &&
    value.chatVersion === CHAT_VERSION &&
    uuid.test(String(value.conversationId)) &&
    typeof value.clientInstanceId === 'string' &&
    value.clientInstanceId.length > 0 &&
    value.clientInstanceId.length <= 80 &&
    (value.expiresAt === null || isDate(value.expiresAt))
  );
}

export function parseChatAttentionResponse(value: unknown): ChatAttentionResponse | null {
  return isChatAttentionResponse(value) ? value : null;
}

export function isChatReportReceipt(value: unknown): value is ChatReportReceipt {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      'id',
      'conversationId',
      'messageId',
      'reasonCode',
      'status',
      'createdAt',
    ]) &&
    uuid.test(String(value.id)) &&
    uuid.test(String(value.conversationId)) &&
    (value.messageId === null || uuid.test(String(value.messageId))) &&
    (CHAT_REPORT_REASON_CODES as readonly string[]).includes(String(value.reasonCode)) &&
    ['SUBMITTED', 'REVIEWED'].includes(String(value.status)) &&
    isDate(value.createdAt)
  );
}

export function parseChatReportReceipt(value: unknown): ChatReportReceipt | null {
  return isChatReportReceipt(value) ? value : null;
}

export function parseChatRealtimeEvent(value: unknown): ChatRealtimeEvent | null {
  if (!isRecord(value) || value.eventVersion !== CHAT_VERSION || typeof value.type !== 'string')
    return null;
  if (
    value.type === 'chat.message.accepted' &&
    hasExactKeys(value, ['eventVersion', 'type', 'message', 'conversation', 'unreadTotal']) &&
    isChatMessage(value.message) &&
    isChatConversationSummary(value.conversation) &&
    isSafeInt(value.unreadTotal)
  )
    return value as unknown as ChatMessageAcceptedEvent;
  if (
    value.type === 'chat.conversation.updated' &&
    hasExactKeys(value, ['eventVersion', 'type', 'conversation']) &&
    isChatConversationSummary(value.conversation)
  )
    return value as unknown as ChatConversationUpdatedEvent;
  if (
    value.type === 'chat.read.updated' &&
    hasExactKeys(value, [
      'eventVersion',
      'type',
      'conversationId',
      'userId',
      'throughSequence',
      'unreadCount',
      'unreadTotal',
    ]) &&
    uuid.test(String(value.conversationId)) &&
    uuid.test(String(value.userId)) &&
    isSafeInt(value.throughSequence) &&
    isSafeInt(value.unreadCount) &&
    isSafeInt(value.unreadTotal)
  )
    return value as unknown as ChatReadUpdatedEvent;
  if (
    value.type === 'chat.unread.updated' &&
    hasExactKeys(value, ['eventVersion', 'type', 'conversationId', 'unreadCount', 'unreadTotal']) &&
    uuid.test(String(value.conversationId)) &&
    isSafeInt(value.unreadCount) &&
    isSafeInt(value.unreadTotal)
  )
    return value as unknown as ChatUnreadUpdatedEvent;
  if (
    value.type === 'chat.presence.updated' &&
    hasExactKeys(value, ['eventVersion', 'type', 'userId', 'presence']) &&
    uuid.test(String(value.userId)) &&
    isChatPresence(value.presence)
  )
    return value as unknown as ChatPresenceUpdatedEvent;
  if (
    value.type === 'chat.safety.updated' &&
    hasExactKeys(value, ['eventVersion', 'type', 'conversation']) &&
    isChatConversationSummary(value.conversation)
  )
    return value as unknown as ChatSafetyUpdatedEvent;
  if (
    value.type === 'chat.notification.updated' &&
    hasExactKeys(value, ['eventVersion', 'type', 'conversationId', 'notificationUnreadCount']) &&
    uuid.test(String(value.conversationId)) &&
    isSafeInt(value.notificationUnreadCount)
  )
    return value as unknown as ChatNotificationUpdatedEvent;
  return null;
}

export function parseChatProblemDetails(value: unknown): ChatProblemDetails | null {
  return isChatProblemDetails(value) ? value : null;
}
