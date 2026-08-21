import type {
  AdminProductActionResult,
  AdminProductLookupResponse,
} from '@shopee-clone/contracts';
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
import type { AdminProductActionDto, AdminProductLookupQueryDto } from './admin.dto';
import { AdminService } from './admin.service';

@ApiTags('admin products')
@ApiBearerAuth()
@Controller('admin/products')
@UseFilters(AdminExceptionFilter)
@UseGuards(AuthGuard, RolesGuard)
@RequireRoles('admin')
export class AdminProductsController {
  constructor(@Inject(AdminService) private readonly admin: AdminService) {}

  @Get('lookup')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Lookup product details by slug or UUID' })
  lookup(@Query() query: AdminProductLookupQueryDto): Promise<AdminProductLookupResponse> {
    const identifier = query.slug || query.id || '';
    return this.admin.lookupProduct(identifier);
  }

  @Post(':productId/actions')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Perform product moderation action (SUSPEND / RESTORE)' })
  executeAction(
    @Param('productId') productId: string,
    @Body() input: AdminProductActionDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<AdminProductActionResult> {
    return this.admin.applyProductAction(productId, input, request.authUser!.id);
  }
}
