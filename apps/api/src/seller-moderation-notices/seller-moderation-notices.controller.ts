import type {
  MarkSellerNoticeReadResponse,
  SellerModerationNoticeListResponse,
} from '@shopee-clone/contracts';
import {
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { RequireRoles, RolesGuard } from '../auth/role-authorization.guard';
import type { SellerModerationNoticesQueryDto } from './seller-moderation-notices.dto';
import { SellerModerationNoticesExceptionFilter } from './seller-moderation-notices-exception.filter';
import { SellerModerationNoticesService } from './seller-moderation-notices.service';

@ApiTags('seller-moderation-notices')
@ApiBearerAuth()
@ApiResponse({ status: 401, description: 'Authentication required' })
@ApiResponse({ status: 403, description: 'Seller role required' })
@Controller('seller/moderation-notices')
@UseFilters(SellerModerationNoticesExceptionFilter)
@UseGuards(AuthGuard, RolesGuard)
@RequireRoles('seller')
export class SellerModerationNoticesController {
  constructor(
    @Inject(SellerModerationNoticesService)
    private readonly service: SellerModerationNoticesService,
  ) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'List seller moderation notices with cursor pagination and unread filtering' })
  @ApiResponse({ status: 200, description: 'Seller moderation notices list and unread count' })
  async listNotices(
    @Req() req: AuthenticatedRequest,
    @Query() query: SellerModerationNoticesQueryDto,
  ): Promise<SellerModerationNoticeListResponse> {
    return this.service.listNotices(req.authUser!.id, query);
  }

  @Post(':noticeId/read')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Mark a seller moderation notice as read' })
  @ApiParam({ name: 'noticeId', format: 'uuid', description: 'Notice identifier' })
  @ApiResponse({ status: 200, description: 'Updated notice read status' })
  @ApiResponse({ status: 404, description: 'Notice not found or belongs to another user' })
  async markRead(
    @Req() req: AuthenticatedRequest,
    @Param('noticeId') noticeId: string,
  ): Promise<MarkSellerNoticeReadResponse> {
    return this.service.markRead(req.authUser!.id, noticeId);
  }
}
