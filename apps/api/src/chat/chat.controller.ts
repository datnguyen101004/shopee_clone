import { Body, Controller, Get, Header, HttpCode, Inject, Param, Post, Put, Query, Req, UseFilters, UseGuards } from '@nestjs/common';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { ChatService } from './chat.service';
// These classes are runtime values used by Nest's validation and filter metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ChatConversationQueryDto, ChatMessageQueryDto, MarkChatReadDto, SendChatMessageDto } from './chat.dto';
import { ChatExceptionFilter } from './chat.exception-filter';

@Controller('chat')
@UseGuards(AuthGuard)
@UseFilters(ChatExceptionFilter)
export class ChatController {
  constructor(@Inject(ChatService) private readonly chat: ChatService) {}

  @Get('targets/shops/:shopId')
  @Header('Cache-Control', 'private, no-store')
  target(@Req() req: AuthenticatedRequest, @Param('shopId') shopId: string) { return this.chat.target(req.authUser!.id, shopId); }

  @Get('conversations')
  @Header('Cache-Control', 'private, no-store')
  list(@Req() req: AuthenticatedRequest, @Query() query: ChatConversationQueryDto) { return this.chat.list(req.authUser!.id, query); }

  @Get('conversations/unread-count')
  @Header('Cache-Control', 'private, no-store')
  unread(@Req() req: AuthenticatedRequest) { return this.chat.unreadCount(req.authUser!.id); }

  @Get('conversations/:conversationId/messages')
  @Header('Cache-Control', 'private, no-store')
  messages(@Req() req: AuthenticatedRequest, @Param('conversationId') id: string, @Query() query: ChatMessageQueryDto) { return this.chat.messages(req.authUser!.id, id, query); }

  @Post('messages')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  send(@Req() req: AuthenticatedRequest, @Body() body: SendChatMessageDto) { return this.chat.send(req.authUser!.id, body, req.ip ?? 'unknown'); }

  @Put('conversations/:conversationId/read')
  @Header('Cache-Control', 'private, no-store')
  read(@Req() req: AuthenticatedRequest, @Param('conversationId') id: string, @Body() body: MarkChatReadDto) { return this.chat.markRead(req.authUser!.id, id, body.throughSequence); }

  @Post('realtime-ticket')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  ticket(@Req() req: AuthenticatedRequest) { return this.chat.issueTicket(req.authUser!.id, req.authSessionId!); }
}
