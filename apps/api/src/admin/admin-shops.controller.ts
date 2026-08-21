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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { RequireRoles, RolesGuard } from '../auth/role-authorization.guard';
import { AdminExceptionFilter } from './admin-exception.filter';
import type { AdminShopActionDto, AdminShopListQueryDto } from './admin.dto';
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
  @ApiOperation({ summary: 'List and search shops with keyset pagination' })
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
  executeAction(
    @Param('shopId') shopId: string,
    @Body() input: AdminShopActionDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<AdminShopSummary> {
    return this.admin.executeShopAction(request.authUser!.id, shopId, input);
  }
}
