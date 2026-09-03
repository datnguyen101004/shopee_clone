import type { AdminDashboardResponse } from '@shopee-clone/contracts';
import {
  Controller,
  Get,
  Header,
  Inject,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AuthGuard } from '../auth/auth.guard';
import { RequireRoles, RolesGuard } from '../auth/role-authorization.guard';
import { AdminExceptionFilter } from './admin-exception.filter';
import { AdminService } from './admin.service';

@ApiTags('admin dashboard')
@ApiBearerAuth()
@Controller('admin/dashboard')
@UseFilters(AdminExceptionFilter)
@UseGuards(AuthGuard, RolesGuard)
@RequireRoles('admin')
export class AdminDashboardController {
  constructor(@Inject(AdminService) private readonly admin: AdminService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Get overview dashboard counts for admin console' })
  dashboard(): Promise<AdminDashboardResponse> {
    return this.admin.dashboard();
  }
}
