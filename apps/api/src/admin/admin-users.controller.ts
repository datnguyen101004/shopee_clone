import type { AdminUserListResponse, AdminUserSummary } from '@shopee-clone/contracts';
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
import { AdminUserActionDto, AdminUserListQueryDto } from './admin.dto';
import { AdminService } from './admin.service';

@ApiTags('admin users')
@ApiBearerAuth()
@Controller('admin/users')
@UseFilters(AdminExceptionFilter)
@UseGuards(AuthGuard, RolesGuard)
@RequireRoles('admin')
export class AdminUsersController {
  constructor(@Inject(AdminService) private readonly admin: AdminService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'List and search users with keyset pagination' })
  list(@Query() query: AdminUserListQueryDto): Promise<AdminUserListResponse> {
    return this.admin.listUsers(query);
  }

  @Get(':userId')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Get user details by ID' })
  getById(@Param('userId') userId: string): Promise<AdminUserSummary> {
    return this.admin.getUser(userId);
  }

  @Post(':userId/actions')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Perform status mutation action (SUSPEND / RESTORE) on user' })
  @ApiResponse({ status: 409, description: 'A seller account action must transition its paired shop.' })
  executeAction(
    @Param('userId') userId: string,
    @Body() input: AdminUserActionDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<AdminUserSummary> {
    return this.admin.executeUserAction(request.authUser!.id, userId, input);
  }
}
