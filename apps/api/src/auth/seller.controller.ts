import type { SellerShop } from '@shopee-clone/contracts';
import { Controller, Get, Header, Inject, Req, UseFilters, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AuthExceptionFilter } from './auth-exception.filter';
import { AuthGuard, type AuthenticatedRequest } from './auth.guard';
import { MarketplaceOwnershipService } from './marketplace-ownership.service';
import { RequireRoles, RolesGuard } from './role-authorization.guard';

@ApiTags('seller authorization')
@ApiBearerAuth()
@Controller('seller')
@UseFilters(AuthExceptionFilter)
@UseGuards(AuthGuard, RolesGuard)
@RequireRoles('seller')
export class SellerController {
  constructor(
    @Inject(MarketplaceOwnershipService)
    private readonly ownership: MarketplaceOwnershipService,
  ) {}

  @Get('shop')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: "Return only the authenticated seller's owned shop" })
  shop(@Req() request: AuthenticatedRequest): Promise<SellerShop> {
    return this.ownership.ownedShop(request.authUser!.id);
  }
}
