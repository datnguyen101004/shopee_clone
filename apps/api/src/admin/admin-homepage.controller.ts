import type {
  AdminBannerListResponse,
  AdminBannerSummary,
  AdminHomepageModuleListResponse,
  AdminHomepageModuleSummary,
} from '@shopee-clone/contracts';
import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { RequireRoles, RolesGuard } from '../auth/role-authorization.guard';
import { AdminExceptionFilter } from './admin-exception.filter';
import {
  CreateAdminBannerDto,
  ReorderAdminBannersDto,
  UpdateAdminBannerDto,
  UpdateAdminHomepageModuleSettingsDto,
} from './admin.dto';
import { AdminService } from './admin.service';

@ApiTags('admin homepage configuration')
@ApiBearerAuth()
@Controller('admin/homepage')
@UseFilters(AdminExceptionFilter)
@UseGuards(AuthGuard, RolesGuard)
@RequireRoles('admin')
export class AdminHomepageController {
  constructor(@Inject(AdminService) private readonly admin: AdminService) {}

  // Banners
  @Get('banners')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'List all campaign banners' })
  async listBanners(): Promise<AdminBannerListResponse> {
    const items = await this.admin.listBanners();
    return { items };
  }

  @Post('banners')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Create a new campaign banner' })
  createBanner(
    @Body() input: CreateAdminBannerDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<AdminBannerSummary> {
    return this.admin.createBanner(request.authUser!.id, input);
  }

  @Patch('banners/:bannerId')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Update a campaign banner' })
  updateBanner(
    @Param('bannerId') bannerId: string,
    @Body() input: UpdateAdminBannerDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<AdminBannerSummary> {
    return this.admin.updateBanner(request.authUser!.id, bannerId, input);
  }

  @Delete('banners/:bannerId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Delete a campaign banner' })
  deleteBanner(
    @Param('bannerId') bannerId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    return this.admin.deleteBanner(request.authUser!.id, bannerId);
  }

  @Post('banners/reorder')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Reorder campaign banners' })
  reorderBanners(
    @Body() input: ReorderAdminBannersDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<AdminBannerSummary[]> {
    return this.admin.reorderBanners(request.authUser!.id, input);
  }

  // Modules
  @Get('modules')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'List all homepage module platform settings' })
  listModules(): Promise<AdminHomepageModuleListResponse> {
    return this.admin.listHomepageModules();
  }

  @Patch('modules/:moduleId')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Update homepage module settings (enable, sort, active window)' })
  updateModuleSettings(
    @Param('moduleId') moduleId: string,
    @Body() input: UpdateAdminHomepageModuleSettingsDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<AdminHomepageModuleSummary> {
    return this.admin.updateHomepageModuleSettings(request.authUser!.id, moduleId, input);
  }
}
