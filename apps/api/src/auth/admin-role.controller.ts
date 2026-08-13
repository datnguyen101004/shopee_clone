import {
  isCanonicalRoleTargetId,
  isElevatedMarketplaceRole,
  type RoleAssignmentResult,
  type RoleAuditPage,
} from '@shopee-clone/contracts';
import {
  BadRequestException,
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

import { AuthExceptionFilter } from './auth-exception.filter';
import { AuthGuard, type AuthenticatedRequest } from './auth.guard';
import { RequireRoles, RolesGuard } from './role-authorization.guard';
import { RoleAuthorizationService } from './role-authorization.service';
// DTO classes must remain runtime values for Nest validation metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { GrantRoleDto, RevokeRoleDto, RoleAuditQueryDto } from './role.dto';

@ApiTags('role administration')
@ApiBearerAuth()
@Controller('admin')
@UseFilters(AuthExceptionFilter)
@UseGuards(AuthGuard, RolesGuard)
@RequireRoles('admin')
export class AdminRoleController {
  constructor(
    @Inject(RoleAuthorizationService)
    private readonly roles: RoleAuthorizationService,
  ) {}

  @Post('users/:userId/roles')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Grant an elevated marketplace role' })
  grant(
    @Param('userId') userId: string,
    @Body() input: GrantRoleDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<RoleAssignmentResult> {
    if (!isCanonicalRoleTargetId(userId)) throw new BadRequestException();
    return this.roles.grantRole(request.authUser!.id, userId, input.role, input.reason);
  }

  @Post('users/:userId/roles/:role/revoke')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Revoke an elevated marketplace role' })
  revoke(
    @Param('userId') userId: string,
    @Param('role') role: string,
    @Body() input: RevokeRoleDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<RoleAssignmentResult> {
    if (!isCanonicalRoleTargetId(userId) || !isElevatedMarketplaceRole(role)) {
      throw new BadRequestException();
    }
    return this.roles.revokeRole(request.authUser!.id, userId, role, input.reason);
  }

  @Get('role-audit')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Read bounded append-only role audit events' })
  audit(@Query() query: RoleAuditQueryDto): Promise<RoleAuditPage> {
    return this.roles.auditPage(query.limit, query.cursor);
  }
}
