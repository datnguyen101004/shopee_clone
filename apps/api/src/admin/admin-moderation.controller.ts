import type {
  ModerationCaseDetail,
  ModerationCaseListResponse,
  ModerationDecisionResult,
} from '@shopee-clone/contracts';
import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { RequireRoles, RolesGuard } from '../auth/role-authorization.guard';
import type {
  AddModerationCaseNoteDto,
  AssignModerationCaseDto,
  CreateModerationDecisionDto,
  ModerationCaseQueryDto,
} from './admin-moderation.dto';
import { AdminExceptionFilter } from './admin-exception.filter';
import { AdminModerationService } from './admin-moderation.service';

@ApiTags('admin-moderation')
@ApiBearerAuth()
@ApiResponse({ status: 400, description: 'Invalid parameters or validation error' })
@ApiResponse({ status: 401, description: 'Authentication required' })
@ApiResponse({ status: 403, description: 'Admin role required' })
@ApiResponse({ status: 404, description: 'Case not found' })
@ApiResponse({ status: 409, description: 'Version conflict or idempotency mismatch' })
@Controller('admin/moderation/cases')
@UseFilters(AdminExceptionFilter)
@UseGuards(AuthGuard, RolesGuard)
@RequireRoles('admin')
export class AdminModerationController {
  constructor(
    @Inject(AdminModerationService)
    private readonly moderationService: AdminModerationService,
  ) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'List moderation cases with queue filters and cursor pagination' })
  @ApiResponse({ status: 200, description: 'Moderation case summary list' })
  listCases(@Query() query: ModerationCaseQueryDto): Promise<ModerationCaseListResponse> {
    return this.moderationService.listCases(query);
  }

  @Get(':caseId')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Get complete moderation case details including reports, events, and decisions' })
  @ApiParam({ name: 'caseId', format: 'uuid', description: 'Moderation case identifier' })
  @ApiResponse({ status: 200, description: 'Moderation case detail' })
  getCaseDetail(@Param('caseId') caseId: string): Promise<ModerationCaseDetail> {
    return this.moderationService.getCaseDetail(caseId);
  }

  @Post(':caseId/assign')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Assign or unassign a moderation case to an admin user' })
  @ApiParam({ name: 'caseId', format: 'uuid', description: 'Moderation case identifier' })
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'UUID idempotency key' })
  @ApiResponse({ status: 200, description: 'Updated case detail' })
  async assignCase(
    @Req() req: AuthenticatedRequest,
    @Param('caseId') caseId: string,
    @Body() input: AssignModerationCaseDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<{ caseDetail: ModerationCaseDetail }> {
    return this.moderationService.assignCase(
      req.authUser!.id,
      caseId,
      input,
      idempotencyKey,
    );
  }

  @Post(':caseId/notes')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Append a private investigation note to the moderation case' })
  @ApiParam({ name: 'caseId', format: 'uuid', description: 'Moderation case identifier' })
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'UUID idempotency key' })
  @ApiResponse({ status: 200, description: 'Updated case detail' })
  async addNote(
    @Req() req: AuthenticatedRequest,
    @Param('caseId') caseId: string,
    @Body() input: AddModerationCaseNoteDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<{ caseDetail: ModerationCaseDetail }> {
    return this.moderationService.addNote(
      req.authUser!.id,
      caseId,
      input,
      idempotencyKey,
    );
  }

  @Post(':caseId/decisions')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Record a moderation decision (NO_ACTION, SUSPEND_TARGET, RESTORE_TARGET) or reversal' })
  @ApiParam({ name: 'caseId', format: 'uuid', description: 'Moderation case identifier' })
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'UUID idempotency key' })
  @ApiResponse({ status: 200, description: 'Decision result and updated case detail' })
  async makeDecision(
    @Req() req: AuthenticatedRequest,
    @Param('caseId') caseId: string,
    @Body() input: CreateModerationDecisionDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<ModerationDecisionResult> {
    return this.moderationService.makeDecision(
      req.authUser!.id,
      caseId,
      input,
      idempotencyKey,
    );
  }
}
