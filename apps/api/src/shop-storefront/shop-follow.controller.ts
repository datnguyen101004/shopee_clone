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
import type { ShopFollowMutationResponse, ShopFollowStateList } from '@shopee-clone/contracts';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { AuthOriginGuard } from '../auth/auth-origin.guard';
import { ShopStorefrontExceptionFilter } from './shop-storefront-exception.filter';
import { parseShopId, parseShopStatusIds } from './shop-storefront-input';
import { ShopStorefrontService } from './shop-storefront.service';

@ApiTags('followed shops')
@ApiBearerAuth()
@ApiResponse({ status: 400, description: 'Strict shop identifier validation failed' })
@ApiResponse({ status: 401, description: 'Bearer session is missing or invalid' })
@ApiResponse({ status: 403, description: 'Mutation browser origin is not allowed' })
@ApiResponse({ status: 503, description: 'Follow persistence is temporarily unavailable' })
@Controller('account/followed-shops')
@UseFilters(ShopStorefrontExceptionFilter)
@UseGuards(AuthOriginGuard, AuthGuard)
export class ShopFollowController {
  constructor(@Inject(ShopStorefrontService) private readonly storefront: ShopStorefrontService) {}

  @Get('status')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Read followed state for up to 48 shops in request order' })
  @ApiQuery({ name: 'shopIds', description: 'Comma-delimited canonical UUIDs', required: true })
  @ApiOkResponse({
    description: 'Ordered buyer-scoped follow states',
    schema: {
      type: 'object',
      required: ['items'],
      properties: {
        items: {
          type: 'array',
          maxItems: 48,
          items: {
            type: 'object',
            required: ['shopId', 'isFollowing'],
            properties: {
              shopId: { type: 'string', format: 'uuid' },
              isFollowing: { type: 'boolean' },
            },
          },
        },
      },
    },
  })
  status(
    @Req() request: AuthenticatedRequest,
    @Query('shopIds') shopIds: unknown,
  ): Promise<ShopFollowStateList> {
    return this.storefront.status(request.authUser!.id, parseShopStatusIds(shopIds));
  }

  @Put(':shopId')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Idempotently follow an active shop while preserving first follow time',
  })
  @ApiOkResponse({
    description: 'Confirmed follow state, first timestamp, and count',
    schema: {
      type: 'object',
      required: ['shopId', 'isFollowing', 'followedAt', 'followerCount'],
      properties: {
        shopId: { type: 'string', format: 'uuid' },
        isFollowing: { type: 'boolean' },
        followedAt: { type: 'string', format: 'date-time', nullable: true },
        followerCount: { type: 'integer', minimum: 0, nullable: true },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Shop is unknown, inactive, or deleted' })
  @ApiResponse({ status: 409, description: 'The authenticated user owns this shop' })
  follow(
    @Req() request: AuthenticatedRequest,
    @Param('shopId') shopId: string,
  ): Promise<ShopFollowMutationResponse> {
    return this.storefront.follow(request.authUser!.id, parseShopId(shopId));
  }

  @Delete(':shopId')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Idempotently remove the buyer-owned relation even if unavailable' })
  @ApiOkResponse({
    description: 'Confirmed unfollow state and nullable public count',
    schema: {
      type: 'object',
      required: ['shopId', 'isFollowing', 'followedAt', 'followerCount'],
      properties: {
        shopId: { type: 'string', format: 'uuid' },
        isFollowing: { type: 'boolean' },
        followedAt: { type: 'string', format: 'date-time', nullable: true },
        followerCount: { type: 'integer', minimum: 0, nullable: true },
      },
    },
  })
  unfollow(
    @Req() request: AuthenticatedRequest,
    @Param('shopId') shopId: string,
  ): Promise<ShopFollowMutationResponse> {
    return this.storefront.unfollow(request.authUser!.id, parseShopId(shopId));
  }
}
