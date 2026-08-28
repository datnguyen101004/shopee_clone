import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { ChatService } from './chat.service';
import { ChatError } from './chat.errors';
// These classes are runtime values used by Nest's validation and filter metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import {
  ChatConversationQueryDto,
  ChatMessageQueryDto,
  ChatAttentionDto,
  ChatReportDto,
  MarkChatReadDto,
  SendChatMessageDto,
} from './chat.dto';
import { ChatExceptionFilter } from './chat.exception-filter';

const chatSummarySchema = {
  type: 'object',
  required: [
    'id',
    'participant',
    'lastMessagePreview',
    'lastMessageAt',
    'unreadCount',
    'lastReadSequence',
    'lastMessageSequence',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    participant: {
      type: 'object',
      properties: {
        userId: { type: 'string', format: 'uuid' },
        displayName: { type: 'string' },
        avatarUrl: { type: 'string', nullable: true },
        presence: { type: 'string', enum: ['ACTIVE', 'INACTIVE'] },
      },
    },
    shopName: { type: 'string', nullable: true },
    lastMessagePreview: { type: 'string' },
    lastMessageAt: { type: 'string', format: 'date-time' },
    unreadCount: { type: 'integer', minimum: 0 },
    lastReadSequence: { type: 'integer', minimum: 0 },
    lastMessageSequence: { type: 'integer', minimum: 0 },
    canMessage: { type: 'boolean' },
    notificationsMuted: { type: 'boolean' },
    blockedByMe: { type: 'boolean' },
  },
};

const chatMessageSchema = {
  type: 'object',
  required: [
    'id',
    'conversationId',
    'sequence',
    'senderUserId',
    'clientMessageId',
    'content',
    'createdAt',
    'deliveryState',
    'isRead',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    conversationId: { type: 'string', format: 'uuid' },
    sequence: { type: 'integer', minimum: 1 },
    senderUserId: { type: 'string', format: 'uuid' },
    clientMessageId: { type: 'string', format: 'uuid' },
    content: { type: 'string', maxLength: 2000 },
    createdAt: { type: 'string', format: 'date-time' },
    deliveryState: { type: 'string', enum: ['SENT', 'PENDING', 'FAILED'] },
    isRead: { type: 'boolean' },
    replyTo: {
      nullable: true,
      type: 'object',
      properties: {
        messageId: { type: 'string', format: 'uuid' },
        sequence: { type: 'integer', minimum: 1 },
        senderUserId: { type: 'string', format: 'uuid' },
        senderLabel: { type: 'string' },
        preview: { type: 'string', maxLength: 160 },
      },
    },
  },
};

@Controller('chat')
@ApiTags('chat')
@ApiBearerAuth()
@ApiResponse({ status: 400, description: 'Invalid chat request or cursor.' })
@ApiResponse({ status: 401, description: 'Authenticated bearer session required.' })
@ApiResponse({ status: 403, description: 'Conversation or send operation is forbidden.' })
@ApiResponse({ status: 404, description: 'Chat target or conversation is unavailable.' })
@ApiResponse({ status: 409, description: 'Self-target or idempotency conflict.' })
@ApiResponse({ status: 429, description: 'Chat message rate limit exceeded.' })
@ApiResponse({ status: 503, description: 'Chat persistence or realtime service is unavailable.' })
@UseGuards(AuthGuard)
@UseFilters(ChatExceptionFilter)
export class ChatController {
  constructor(@Inject(ChatService) private readonly chat: ChatService) {}

  @Get('targets/shops/:shopId')
  @ApiOperation({
    summary: 'Resolve an authorized shop chat target and existing user conversation',
  })
  @ApiParam({ name: 'shopId', format: 'uuid', description: 'Shop identifier' })
  @ApiResponse({
    status: 200,
    description: 'Target projection with generic canMessage eligibility.',
    schema: {
      type: 'object',
      required: [
        'chatVersion',
        'shopId',
        'shopName',
        'ownerUserId',
        'ownerDisplayName',
        'ownerAvatarUrl',
        'isSelf',
      ],
      properties: {
        chatVersion: { type: 'string', example: 'chat-v1' },
        shopId: { type: 'string', format: 'uuid' },
        shopName: { type: 'string' },
        ownerUserId: { type: 'string', format: 'uuid' },
        ownerDisplayName: { type: 'string' },
        ownerAvatarUrl: { type: 'string', nullable: true },
        isSelf: { type: 'boolean' },
        canMessage: { type: 'boolean' },
        existingConversation: chatSummarySchema,
      },
    },
  })
  @Header('Cache-Control', 'private, no-store')
  target(@Req() req: AuthenticatedRequest, @Param('shopId') shopId: string) {
    return this.chat.target(req.authUser!.id, shopId);
  }

  @Get('conversations')
  @ApiOperation({ summary: 'List authenticated user conversations with keyset pagination' })
  @ApiQuery({ name: 'limit', required: false, type: Number, minimum: 1, maximum: 50 })
  @ApiQuery({ name: 'cursor', required: false, description: 'Opaque conversation cursor' })
  @ApiQuery({ name: 'query', required: false, description: 'Participant display-name search' })
  @ApiResponse({
    status: 200,
    description: 'Conversation summaries and aggregate unread count.',
    schema: {
      type: 'object',
      required: ['chatVersion', 'items', 'nextCursor', 'unreadCount'],
      properties: {
        chatVersion: { type: 'string', example: 'chat-v1' },
        items: { type: 'array', items: chatSummarySchema },
        nextCursor: { type: 'string', nullable: true },
        unreadCount: { type: 'integer', minimum: 0 },
      },
    },
  })
  @Header('Cache-Control', 'private, no-store')
  list(@Req() req: AuthenticatedRequest, @Query() query: ChatConversationQueryDto) {
    return this.chat.list(req.authUser!.id, query);
  }

  @Get('conversations/unread-count')
  @ApiOperation({ summary: 'Read the authenticated user aggregate chat unread count' })
  @ApiResponse({
    status: 200,
    description: 'Unread count projection.',
    schema: {
      type: 'object',
      required: ['chatVersion', 'unreadCount'],
      properties: {
        chatVersion: { type: 'string', example: 'chat-v1' },
        unreadCount: { type: 'integer', minimum: 0 },
      },
    },
  })
  @Header('Cache-Control', 'private, no-store')
  unread(@Req() req: AuthenticatedRequest) {
    return this.chat.unreadCount(req.authUser!.id);
  }

  @Get('conversations/:conversationId/messages')
  @ApiOperation({ summary: 'Read participant-scoped chat history with sequence cursors' })
  @ApiParam({ name: 'conversationId', format: 'uuid', description: 'Conversation identifier' })
  @ApiQuery({ name: 'limit', required: false, type: Number, minimum: 1, maximum: 50 })
  @ApiQuery({ name: 'beforeSequence', required: false, type: Number, minimum: 1 })
  @ApiQuery({ name: 'afterSequence', required: false, type: Number, minimum: 1 })
  @ApiResponse({
    status: 200,
    description: 'Authorized message page with generic send eligibility.',
    schema: {
      type: 'object',
      required: [
        'chatVersion',
        'conversation',
        'items',
        'hasMoreBefore',
        'hasMoreAfter',
        'unreadCount',
      ],
      properties: {
        chatVersion: { type: 'string', example: 'chat-v1' },
        conversation: chatSummarySchema,
        items: { type: 'array', items: chatMessageSchema },
        hasMoreBefore: { type: 'boolean' },
        hasMoreAfter: { type: 'boolean' },
        unreadCount: { type: 'integer', minimum: 0 },
      },
    },
  })
  @Header('Cache-Control', 'private, no-store')
  messages(
    @Req() req: AuthenticatedRequest,
    @Param('conversationId') id: string,
    @Query() query: ChatMessageQueryDto,
  ) {
    return this.chat.messages(req.authUser!.id, id, query);
  }

  @Post('messages')
  @ApiOperation({ summary: 'Send one idempotent authenticated user-to-user chat message' })
  @ApiBody({ type: SendChatMessageDto })
  @ApiResponse({
    status: 200,
    description: 'Accepted message and canonical conversation projection.',
    schema: {
      type: 'object',
      required: ['chatVersion', 'conversation', 'message'],
      properties: {
        chatVersion: { type: 'string', example: 'chat-v1' },
        conversation: chatSummarySchema,
        message: chatMessageSchema,
      },
    },
  })
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  send(@Req() req: AuthenticatedRequest, @Body() body: SendChatMessageDto) {
    return this.chat.send(req.authUser!.id, body, req.ip ?? 'unknown');
  }

  @Put('conversations/:conversationId/mute')
  @ApiOperation({ summary: 'Mute notifications for one conversation' })
  @ApiParam({ name: 'conversationId', format: 'uuid' })
  @Header('Cache-Control', 'private, no-store')
  mute(@Req() req: AuthenticatedRequest, @Param('conversationId') conversationId: string) {
    return this.chat.setMute(req.authUser!.id, conversationId, true);
  }

  @Delete('conversations/:conversationId/mute')
  @ApiOperation({ summary: 'Unmute notifications for one conversation' })
  @ApiParam({ name: 'conversationId', format: 'uuid' })
  @Header('Cache-Control', 'private, no-store')
  unmute(@Req() req: AuthenticatedRequest, @Param('conversationId') conversationId: string) {
    return this.chat.setMute(req.authUser!.id, conversationId, false);
  }

  @Put('users/:userId/block')
  @ApiOperation({ summary: 'Block a chat participant' })
  @ApiParam({ name: 'userId', format: 'uuid' })
  @Header('Cache-Control', 'private, no-store')
  block(@Req() req: AuthenticatedRequest, @Param('userId') userId: string) {
    return this.chat.setBlock(req.authUser!.id, userId, true);
  }

  @Delete('users/:userId/block')
  @ApiOperation({ summary: 'Unblock a chat participant' })
  @ApiParam({ name: 'userId', format: 'uuid' })
  @Header('Cache-Control', 'private, no-store')
  unblock(@Req() req: AuthenticatedRequest, @Param('userId') userId: string) {
    return this.chat.setBlock(req.authUser!.id, userId, false);
  }

  @Put('conversations/:conversationId/attention')
  @ApiOperation({ summary: 'Refresh or clear active chat attention' })
  @ApiParam({ name: 'conversationId', format: 'uuid' })
  @ApiBody({ type: ChatAttentionDto })
  @Header('Cache-Control', 'private, no-store')
  attention(
    @Req() req: AuthenticatedRequest,
    @Param('conversationId') conversationId: string,
    @Body() body: ChatAttentionDto,
  ) {
    return this.chat.attention(req.authUser!.id, req.authSessionId!, conversationId, body);
  }

  @Post('reports')
  @ApiOperation({ summary: 'Report a chat conversation or message' })
  @ApiBody({ type: ChatReportDto })
  @ApiResponse({ status: 409, description: 'Report idempotency conflict.' })
  @Header('Cache-Control', 'private, no-store')
  report(
    @Req() req: AuthenticatedRequest,
    @Body() body: ChatReportDto,
  ) {
    const idempotencyKey = req.headers['idempotency-key'];
    if (typeof idempotencyKey !== 'string')
      throw new ChatError('chat-report-invalid', 400, 'Idempotency-Key header is required.', ['Idempotency-Key']);
    return this.chat.report(req.authUser!.id, body, idempotencyKey);
  }

  @Get('reports')
  @ApiOperation({ summary: 'List the caller chat report receipts' })
  @ApiQuery({ name: 'conversationId', required: false, format: 'uuid' })
  @Header('Cache-Control', 'private, no-store')
  reports(@Req() req: AuthenticatedRequest, @Query('conversationId') conversationId?: string) {
    return this.chat.listReports(req.authUser!.id, conversationId);
  }

  @Put('conversations/:conversationId/read')
  @ApiOperation({ summary: 'Advance a participant read watermark monotonically' })
  @ApiParam({ name: 'conversationId', format: 'uuid', description: 'Conversation identifier' })
  @ApiBody({ type: MarkChatReadDto })
  @ApiResponse({
    status: 200,
    description: 'Authoritative read watermark and unread totals.',
    schema: {
      type: 'object',
      required: [
        'chatVersion',
        'conversationId',
        'throughSequence',
        'unreadCount',
        'unreadTotal',
        'readAt',
      ],
      properties: {
        chatVersion: { type: 'string', example: 'chat-v1' },
        conversationId: { type: 'string', format: 'uuid' },
        throughSequence: { type: 'integer', minimum: 1 },
        unreadCount: { type: 'integer', minimum: 0 },
        unreadTotal: { type: 'integer', minimum: 0 },
        readAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @Header('Cache-Control', 'private, no-store')
  read(
    @Req() req: AuthenticatedRequest,
    @Param('conversationId') id: string,
    @Body() body: MarkChatReadDto,
  ) {
    return this.chat.markRead(req.authUser!.id, id, body.throughSequence);
  }

  @Post('realtime-ticket')
  @ApiOperation({ summary: 'Issue a one-time Socket.IO chat realtime ticket' })
  @ApiResponse({
    status: 200,
    description: 'Short-lived one-time realtime ticket.',
    schema: {
      type: 'object',
      required: ['chatVersion', 'ticket', 'expiresAt'],
      properties: {
        chatVersion: { type: 'string', example: 'chat-v1' },
        ticket: { type: 'string' },
        expiresAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  ticket(@Req() req: AuthenticatedRequest) {
    return this.chat.issueTicket(req.authUser!.id, req.authSessionId!);
  }
}
