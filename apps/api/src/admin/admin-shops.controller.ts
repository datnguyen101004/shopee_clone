import type { AdminShopListResponse, AdminShopSummary } from '@shopee-clone/contracts';
import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { RequireRoles, RolesGuard } from '../auth/role-authorization.guard';
import { AdminExceptionFilter } from './admin-exception.filter';
// DTO classes must remain runtime values for Nest validation metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AdminShopActionDto, AdminShopListQueryDto } from './admin.dto';
import { AdminService } from './admin.service';

@ApiTags('admin shops')
@ApiBearerAuth()
@Controller('admin/shops')
@UseFilters(AdminExceptionFilter)
@UseGuards(AuthGuard, RolesGuard)
@RequireRoles('admin')
export class AdminShopsController {
  constructor(@Inject(AdminService) private readonly admin: AdminService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'List and search shops by page, with 10 shops per page' })
  list(@Query() query: AdminShopListQueryDto): Promise<AdminShopListResponse> {
    return this.admin.listShops(query);
  }

  @Get(':shopId')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Get shop details by ID' })
  getById(@Param('shopId') shopId: string): Promise<AdminShopSummary> {
    return this.admin.getShop(shopId);
  }

  @Post(':shopId/actions')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Perform status mutation action (SUSPEND / RESTORE) on shop' })
  @ApiResponse({ status: 409, description: 'A seller shop action must transition its paired owner account.' })
  executeAction(
    @Param('shopId') shopId: string,
    @Body() input: AdminShopActionDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<AdminShopSummary> {
    return this.admin.executeShopAction(request.authUser!.id, shopId, input);
  }
}
