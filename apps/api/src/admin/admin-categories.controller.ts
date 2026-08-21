import type { AdminCategoryListResponse, AdminCategorySummary } from '@shopee-clone/contracts';
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
import type {
  CreateAdminCategoryDto,
  ReorderAdminCategoriesDto,
  UpdateAdminCategoryDto,
} from './admin.dto';
import { AdminService } from './admin.service';

@ApiTags('admin categories')
@ApiBearerAuth()
@Controller('admin/categories')
@UseFilters(AdminExceptionFilter)
@UseGuards(AuthGuard, RolesGuard)
@RequireRoles('admin')
export class AdminCategoriesController {
  constructor(@Inject(AdminService) private readonly admin: AdminService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'List categories with tree hierarchy' })
  list(): Promise<AdminCategoryListResponse> {
    return this.admin.listCategories();
  }

  @Post()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Create a new catalog category' })
  create(
    @Body() input: CreateAdminCategoryDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<AdminCategorySummary> {
    return this.admin.createCategory(request.authUser!.id, input);
  }

  @Patch(':categoryId')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Update a catalog category' })
  update(
    @Param('categoryId') categoryId: string,
    @Body() input: UpdateAdminCategoryDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<AdminCategorySummary> {
    return this.admin.updateCategory(request.authUser!.id, categoryId, input);
  }

  @Delete(':categoryId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Delete a catalog category with referential checks' })
  delete(
    @Param('categoryId') categoryId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    return this.admin.deleteCategory(request.authUser!.id, categoryId);
  }

  @Post('reorder')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Batch reorder category sort orders' })
  reorder(
    @Body() input: ReorderAdminCategoriesDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<AdminCategorySummary[]> {
    return this.admin.reorderCategories(request.authUser!.id, input);
  }
}
