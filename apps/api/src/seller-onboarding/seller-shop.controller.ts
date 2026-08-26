import type { SellerShopProfile, SellerShopWorkspace } from '@shopee-clone/contracts';
import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Patch,
  Post,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { RequireRoles, RolesGuard } from '../auth/role-authorization.guard';
import { SellerOnboardingExceptionFilter } from './seller-onboarding-exception.filter';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CreateSellerShopDto, UpdateSellerShopDto } from './seller-onboarding.dto';
import { SellerOnboardingService } from './seller-onboarding.service';

@ApiTags('seller shop onboarding')
@ApiBearerAuth()
@Controller('seller/shop')
@UseFilters(SellerOnboardingExceptionFilter)
@UseGuards(AuthGuard, RolesGuard)
export class SellerShopController {
  constructor(
    @Inject(SellerOnboardingService) private readonly onboarding: SellerOnboardingService,
  ) {}

  @Get('workspace')
  @RequireRoles('buyer')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: "Return the authenticated seller's shop workspace" })
  workspace(@Req() request: AuthenticatedRequest): Promise<SellerShopWorkspace> {
    return this.onboarding.workspace(request.authUser!.id);
  }

  @Post()
  @RequireRoles('buyer')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Create the authenticated seller shop application' })
  @ApiResponse({ status: 409, description: 'The account already owns its single shop slot.' })
  create(
    @Req() request: AuthenticatedRequest,
    @Body() input: CreateSellerShopDto,
  ): Promise<SellerShopProfile> {
    return this.onboarding.create(request.authUser!.id, input);
  }

  @Patch()
  @RequireRoles('seller')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: "Update the authenticated seller's owned shop profile" })
  update(
    @Req() request: AuthenticatedRequest,
    @Body() input: UpdateSellerShopDto,
  ): Promise<SellerShopProfile> {
    return this.onboarding.update(request.authUser!.id, input);
  }

  @Patch('registration')
  @RequireRoles('buyer')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Update or resubmit the authenticated buyer shop registration' })
  @ApiResponse({ status: 409, description: 'The existing single shop is in a finalized state.' })
  updateRegistration(
    @Req() request: AuthenticatedRequest,
    @Body() input: UpdateSellerShopDto,
  ): Promise<SellerShopProfile> {
    return this.onboarding.updateRegistration(request.authUser!.id, input);
  }
}
