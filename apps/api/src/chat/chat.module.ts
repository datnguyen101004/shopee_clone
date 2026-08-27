import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ChatController } from './chat.controller';
import { ChatOutboxDispatcher, ChatPresenceService, ChatRealtimeGateway, ChatTicketService } from './chat.realtime';
import { CHAT_CONFIG, loadChatConfig } from './chat.config';
import { ChatService } from './chat.service';

@Module({ imports: [PrismaModule, AuthModule], controllers: [ChatController], providers: [{ provide: CHAT_CONFIG, useFactory: loadChatConfig }, ChatService, ChatTicketService, ChatPresenceService, ChatRealtimeGateway, ChatOutboxDispatcher], exports: [ChatService] })
export class ChatModule {}
