import type { AdminPrivilegedAuditListResponse } from '@shopee-clone/contracts';
import {
  Controller,
  Get,
  Header,
  Inject,
  Query,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AuthGuard } from '../auth/auth.guard';
import { RequireRoles, RolesGuard } from '../auth/role-authorization.guard';
import { AdminExceptionFilter } from './admin-exception.filter';
import type { AdminPrivilegedAuditQueryDto } from './admin.dto';
import { AdminService } from './admin.service';

@ApiTags('admin privileged audit')
@ApiBearerAuth()
@Controller('admin/audit')
@UseFilters(AdminExceptionFilter)
@UseGuards(AuthGuard, RolesGuard)
@RequireRoles('admin')
export class AdminAuditController {
  constructor(@Inject(AdminService) private readonly admin: AdminService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'List append-only privileged audit events with cursor pagination' })
  list(@Query() query: AdminPrivilegedAuditQueryDto): Promise<AdminPrivilegedAuditListResponse> {
    return this.admin.listAuditEvents(query);
  }
}
