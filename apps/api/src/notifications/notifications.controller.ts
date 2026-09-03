import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import type {
  ArchiveNotificationResponse,
  MarkAllNotificationsReadResponse,
  MarkNotificationReadResponse,
  NotificationListResponse,
  NotificationPreferencesResponse,
  NotificationUnreadCountResponse,
} from '@shopee-clone/contracts';
import { parseNotificationId } from '@shopee-clone/contracts';

import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { NotificationExceptionFilter } from './notification-exception.filter';
import { NotificationValidationError } from './notification.errors';
import { NotificationService } from './notification.service';
// These DTO classes are runtime values used by Nest's ValidationPipe metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { NotificationListQueryDto, UpdateNotificationPreferenceDto } from './notifications.dto';

@ApiTags('notifications')
@ApiBearerAuth()
@ApiResponse({ status: 401, description: 'Authentication required' })
@Controller('account/notifications')
@UseFilters(NotificationExceptionFilter)
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(@Inject(NotificationService) private readonly notifications: NotificationService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'List in-app notifications with category filter and cursor pagination' })
  list(
    @Req() request: AuthenticatedRequest,
    @Query() query: NotificationListQueryDto,
  ): Promise<NotificationListResponse> {
    return this.notifications.list(request.authUser!.id, {
      ...(query.category !== undefined ? { category: query.category } : {}),
      ...(query.limit !== undefined ? { limit: query.limit } : {}),
      ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
    });
  }

  @Get('unread-count')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Return unread non-archived notification count' })
  unreadCount(@Req() request: AuthenticatedRequest): Promise<NotificationUnreadCountResponse> {
    return this.notifications.unreadCount(request.authUser!.id);
  }

  @Get('preferences')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'List notification channel preferences by category' })
  preferences(@Req() request: AuthenticatedRequest): Promise<NotificationPreferencesResponse> {
    return this.notifications.listPreferences(request.authUser!.id);
  }

  @Put('preferences')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Update a single category/channel preference' })
  @ApiResponse({ status: 403, description: 'Mandatory preference cannot be disabled' })
  updatePreference(
    @Req() request: AuthenticatedRequest,
    @Body() body: UpdateNotificationPreferenceDto,
  ): Promise<NotificationPreferencesResponse> {
    return this.notifications.updatePreference(request.authUser!.id, body);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Mark all unread notifications as read' })
  markAllRead(@Req() request: AuthenticatedRequest): Promise<MarkAllNotificationsReadResponse> {
    return this.notifications.markAllRead(request.authUser!.id);
  }

  @Post(':notificationId/read')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Mark the selected notification and all older notifications as read' })
  @ApiParam({ name: 'notificationId', format: 'uuid' })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  markRead(
    @Req() request: AuthenticatedRequest,
    @Param('notificationId') notificationId: string,
  ): Promise<MarkNotificationReadResponse> {
    const id = parseNotificationId(notificationId);
    if (!id) throw new NotificationValidationError(['notificationId']);
    return this.notifications.markRead(request.authUser!.id, id);
  }

  @Post(':notificationId/archive')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Archive a notification from the active inbox' })
  @ApiParam({ name: 'notificationId', format: 'uuid' })
  archive(
    @Req() request: AuthenticatedRequest,
    @Param('notificationId') notificationId: string,
  ): Promise<ArchiveNotificationResponse> {
    const id = parseNotificationId(notificationId);
    if (!id) throw new NotificationValidationError(['notificationId']);
    return this.notifications.archive(request.authUser!.id, id);
  }
}
