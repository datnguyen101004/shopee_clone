import {
  Controller,
  Delete,
  Get,
  Header,
  Inject,
  Param,
  Put,
  Query,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import type {
  FavoriteMutationResponse,
  FavoritePage,
  FavoriteStateList,
  RecentlyViewedMutationResponse,
  RecentlyViewedPage,
} from '@shopee-clone/contracts';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';

import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { AuthOriginGuard } from '../auth/auth-origin.guard';
import { EngagementExceptionFilter } from './engagement-exception.filter';
import {
  parseEngagementPagination,
  parseEngagementProductId,
  parseFavoriteStatusIds,
} from './engagement-input';
import { EngagementService } from './engagement.service';

@ApiTags('buyer engagement')
@ApiBearerAuth()
@ApiResponse({ status: 400, description: 'Strict query or product identifier validation failed' })
@ApiResponse({ status: 401, description: 'Bearer session is missing or invalid' })
@ApiResponse({ status: 403, description: 'Mutation browser origin is not allowed' })
@ApiResponse({ status: 503, description: 'Engagement persistence is temporarily unavailable' })
@Controller('account')
@UseFilters(EngagementExceptionFilter)
@UseGuards(AuthOriginGuard, AuthGuard)
export class EngagementController {
  constructor(@Inject(EngagementService) private readonly engagement: EngagementService) {}

  @Get('favorites/status')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Read favorite state for up to 48 products in request order' })
  @ApiQuery({ name: 'productIds', description: 'Comma-delimited canonical UUIDs', required: true })
  status(
    @Req() request: AuthenticatedRequest,
    @Query('productIds') productIds: unknown,
  ): Promise<FavoriteStateList> {
    return this.engagement.status(request.authUser!.id, parseFavoriteStatusIds(productIds));
  }

  @Get('favorites')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'List owned favorites newest first, including unavailable saved items' })
  favorites(
    @Req() request: AuthenticatedRequest,
    @Query() query: Record<string, unknown>,
  ): Promise<FavoritePage> {
    return this.engagement.favorites(request.authUser!.id, parseEngagementPagination(query));
  }

  @Put('favorites/:productId')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Idempotently save a displayable product as a favorite' })
  @ApiResponse({ status: 200, description: 'Confirmed favorite state and original save timestamp' })
  addFavorite(
    @Req() request: AuthenticatedRequest,
    @Param('productId') productId: string,
  ): Promise<FavoriteMutationResponse> {
    return this.engagement.addFavorite(request.authUser!.id, parseEngagementProductId(productId));
  }

  @Delete('favorites/:productId')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Idempotently remove an owned favorite, including unavailable products',
  })
  removeFavorite(
    @Req() request: AuthenticatedRequest,
    @Param('productId') productId: string,
  ): Promise<FavoriteMutationResponse> {
    return this.engagement.removeFavorite(
      request.authUser!.id,
      parseEngagementProductId(productId),
    );
  }

  @Get('recently-viewed')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'List displayable recently viewed products, latest view first' })
  recentlyViewed(
    @Req() request: AuthenticatedRequest,
    @Query() query: Record<string, unknown>,
  ): Promise<RecentlyViewedPage> {
    return this.engagement.recentlyViewed(request.authUser!.id, parseEngagementPagination(query));
  }

  @Put('recently-viewed/:productId')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Record or promote a product view and retain the latest 100 products' })
  @ApiResponse({ status: 200, description: 'Server view timestamp' })
  recordView(
    @Req() request: AuthenticatedRequest,
    @Param('productId') productId: string,
  ): Promise<RecentlyViewedMutationResponse> {
    return this.engagement.recordView(request.authUser!.id, parseEngagementProductId(productId));
  }
}
