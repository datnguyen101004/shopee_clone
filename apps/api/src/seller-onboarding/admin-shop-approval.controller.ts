import { isCanonicalRoleTargetId, type SellerShopProfile } from '@shopee-clone/contracts';
import {
  BadRequestException,
  Body,
  Controller,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { RequireRoles, RolesGuard } from '../auth/role-authorization.guard';
import { SellerOnboardingExceptionFilter } from './seller-onboarding-exception.filter';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ShopApprovalDto } from './seller-onboarding.dto';
import { SellerOnboardingService } from './seller-onboarding.service';

@ApiTags('shop approval')
@ApiBearerAuth()
@Controller('admin/shops')
@UseFilters(SellerOnboardingExceptionFilter)
@UseGuards(AuthGuard, RolesGuard)
@RequireRoles('admin')
export class AdminShopApprovalController {
  constructor(
    @Inject(SellerOnboardingService) private readonly onboarding: SellerOnboardingService,
  ) {}

  @Post(':shopId/approval')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Approve or reject a seller shop application' })
  approve(
    @Param('shopId') shopId: string,
    @Body() input: ShopApprovalDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<SellerShopProfile> {
    if (!isCanonicalRoleTargetId(shopId)) throw new BadRequestException();
    return this.onboarding.approve(shopId, input, request.authUser!.id);
  }
}
