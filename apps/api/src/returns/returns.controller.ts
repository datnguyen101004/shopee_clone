import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  formatReturnVersionEtag,
  parseAdminReturnDecisionRequest,
  parseBuyerReturnActionRequest,
  parseCreateReturnRequest,
  parseReturnEvidenceId,
  parseReturnIdempotencyKey,
  parseReturnListQuery,
  parseReturnReference,
  parseReturnVersionEtag,
  parseSellerReturnActionRequest,
} from '@shopee-clone/contracts';
import type { Response } from 'express';

import { AuthOriginGuard } from '../auth/auth-origin.guard';
import { AuthenticationFailedError } from '../auth/auth.errors';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { RequireRoles, RolesGuard } from '../auth/role-authorization.guard';
import { inspectReturnEvidence } from './return-evidence';
import { ReturnEvidenceStorage } from './return-evidence.storage';
import { ReturnExceptionFilter } from './return-exception.filter';
import { ReturnValidationError } from './return-errors';
import { ReturnService } from './return.service';
// DTO classes must remain runtime values for Nest validation metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import {
  AdminReturnDecisionDto,
  BuyerReturnActionDto,
  CreateReturnDto,
  SellerReturnActionDto,
} from './returns.dto';

function user(request: AuthenticatedRequest) {
  if (!request.authUser) throw new AuthenticationFailedError();
  return request.authUser;
}

@ApiTags('returns and refunds')
@ApiBearerAuth()
@Controller()
@UseFilters(ReturnExceptionFilter)
export class ReturnsController {
  constructor(
    @Inject(ReturnService) private readonly returns: ReturnService,
    @Inject(ReturnEvidenceStorage) private readonly storage: ReturnEvidenceStorage,
  ) {}

  @Post('account/return-evidence')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AuthGuard, AuthOriginGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { files: 1, fileSize: 5 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Stage one private return-evidence image for 24 hours' })
  async stageEvidence(
    @Req() request: AuthenticatedRequest,
    @UploadedFile() file: { buffer: Buffer; mimetype: string; size: number } | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!file) throw new ReturnValidationError(['file']);
    const inspected = inspectReturnEvidence(file.buffer, file.mimetype);
    if (!inspected) throw new ReturnValidationError(['file']);
    const storageKey = await this.storage.write(inspected.mimeType, file.buffer);
    try {
      const result = await this.returns.stageEvidence(user(request).id, {
        storageKey,
        mimeType: inspected.mimeType,
        bytes: file.size,
        width: inspected.dimensions.width,
        height: inspected.dimensions.height,
      });
      response.setHeader('Cache-Control', 'private, no-store');
      return result;
    } catch (error) {
      await this.storage.remove(storageKey);
      throw error;
    }
  }

  @Post('account/orders/:orderReference/returns')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AuthGuard, AuthOriginGuard)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  async create(
    @Req() request: AuthenticatedRequest,
    @Param('orderReference') rawReference: string,
    @Headers('if-match') rawEtag: string | undefined,
    @Headers('idempotency-key') rawKey: string | undefined,
    @Body() body: CreateReturnDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const orderReference = parseReturnReference(rawReference);
    const version = parseReturnVersionEtag(rawEtag?.replace(/^"order-(\d+)"$/, '"return-$1"'));
    const key = parseReturnIdempotencyKey(rawKey);
    const input = parseCreateReturnRequest(body);
    if (!orderReference || version === null || !key || !input)
      throw new ReturnValidationError([
        ...(!orderReference ? ['orderReference'] : []),
        ...(version === null ? ['ifMatch'] : []),
        ...(!key ? ['idempotencyKey'] : []),
        ...(!input ? ['request'] : []),
      ]);
    const result = await this.returns.createBuyer(
      user(request).id,
      orderReference,
      version,
      key,
      input,
    );
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('ETag', formatReturnVersionEtag(result.return.version));
    return result;
  }

  @Get('account/returns')
  @UseGuards(AuthGuard)
  async buyerList(
    @Req() request: AuthenticatedRequest,
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) response: Response,
  ) {
    const parsed = parseReturnListQuery(query);
    if (!parsed) throw new ReturnValidationError(['query']);
    response.setHeader('Cache-Control', 'private, no-store');
    return this.returns.list('BUYER', user(request).id, parsed);
  }

  @Get('account/returns/:returnReference')
  @UseGuards(AuthGuard)
  async buyerDetail(
    @Req() request: AuthenticatedRequest,
    @Param('returnReference') rawReference: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const reference = parseReturnReference(rawReference);
    if (!reference) throw new ReturnValidationError(['returnReference']);
    const result = await this.returns.detailBuyer(user(request).id, reference);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('ETag', formatReturnVersionEtag(result.return.version));
    return result;
  }

  @Post('account/returns/:returnReference/actions')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard, AuthOriginGuard)
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  async buyerAction(
    @Req() request: AuthenticatedRequest,
    @Param('returnReference') rawReference: string,
    @Headers('if-match') rawEtag: string | undefined,
    @Headers('idempotency-key') rawKey: string | undefined,
    @Body() body: BuyerReturnActionDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const reference = parseReturnReference(rawReference);
    const version = parseReturnVersionEtag(rawEtag);
    const key = parseReturnIdempotencyKey(rawKey);
    const input = parseBuyerReturnActionRequest(body);
    if (!reference || version === null || !key || !input)
      throw new ReturnValidationError(['request']);
    const result = await this.returns.actBuyer(user(request).id, reference, version, key, input);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('ETag', formatReturnVersionEtag(result.return.version));
    return result;
  }

  @Get('seller/returns')
  @UseGuards(AuthGuard, RolesGuard)
  @RequireRoles('seller')
  async sellerList(
    @Req() request: AuthenticatedRequest,
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) response: Response,
  ) {
    const parsed = parseReturnListQuery(query);
    if (!parsed) throw new ReturnValidationError(['query']);
    response.setHeader('Cache-Control', 'private, no-store');
    return this.returns.list('SELLER', user(request).id, parsed);
  }

  @Get('seller/returns/:returnReference')
  @UseGuards(AuthGuard, RolesGuard)
  @RequireRoles('seller')
  async sellerDetail(
    @Req() request: AuthenticatedRequest,
    @Param('returnReference') rawReference: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const reference = parseReturnReference(rawReference);
    if (!reference) throw new ReturnValidationError(['returnReference']);
    const result = await this.returns.detailSeller(user(request).id, reference);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('ETag', formatReturnVersionEtag(result.return.version));
    return result;
  }

  @Post('seller/returns/:returnReference/actions')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard, RolesGuard, AuthOriginGuard)
  @RequireRoles('seller')
  async sellerAction(
    @Req() request: AuthenticatedRequest,
    @Param('returnReference') rawReference: string,
    @Headers('if-match') rawEtag: string | undefined,
    @Headers('idempotency-key') rawKey: string | undefined,
    @Body() body: SellerReturnActionDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const reference = parseReturnReference(rawReference);
    const version = parseReturnVersionEtag(rawEtag);
    const key = parseReturnIdempotencyKey(rawKey);
    const input = parseSellerReturnActionRequest(body);
    if (!reference || version === null || !key || !input)
      throw new ReturnValidationError(['request']);
    const result = await this.returns.actSeller(user(request).id, reference, version, key, input);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('ETag', formatReturnVersionEtag(result.return.version));
    return result;
  }

  @Get('admin/returns')
  @UseGuards(AuthGuard, RolesGuard)
  @RequireRoles('admin')
  async adminList(
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) response: Response,
  ) {
    const parsed = parseReturnListQuery(query);
    if (!parsed) throw new ReturnValidationError(['query']);
    response.setHeader('Cache-Control', 'private, no-store');
    return this.returns.list('ADMIN', null, parsed);
  }

  @Get('admin/returns/:returnReference')
  @UseGuards(AuthGuard, RolesGuard)
  @RequireRoles('admin')
  async adminDetail(
    @Param('returnReference') rawReference: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const reference = parseReturnReference(rawReference);
    if (!reference) throw new ReturnValidationError(['returnReference']);
    const result = await this.returns.detailAdmin(reference);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('ETag', formatReturnVersionEtag(result.return.version));
    return result;
  }

  @Post('admin/returns/:returnReference/decisions')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard, RolesGuard, AuthOriginGuard)
  @RequireRoles('admin')
  async adminDecision(
    @Req() request: AuthenticatedRequest,
    @Param('returnReference') rawReference: string,
    @Headers('if-match') rawEtag: string | undefined,
    @Headers('idempotency-key') rawKey: string | undefined,
    @Body() body: AdminReturnDecisionDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const reference = parseReturnReference(rawReference);
    const version = parseReturnVersionEtag(rawEtag);
    const key = parseReturnIdempotencyKey(rawKey);
    const input = parseAdminReturnDecisionRequest(body);
    if (!reference || version === null || !key || !input)
      throw new ReturnValidationError(['request']);
    const result = await this.returns.decideAdmin(user(request).id, reference, version, key, input);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('ETag', formatReturnVersionEtag(result.return.version));
    return result;
  }

  @Get('return-evidence/:evidenceId')
  @UseGuards(AuthGuard)
  async evidence(
    @Req() request: AuthenticatedRequest,
    @Param('evidenceId') rawId: string,
    @Res() response: Response,
  ): Promise<void> {
    const evidenceId = parseReturnEvidenceId(rawId);
    if (!evidenceId) throw new ReturnValidationError(['evidenceId']);
    const actor = user(request);
    const asset = await this.returns.readableEvidence(
      actor.id,
      evidenceId,
      actor.roles.includes('admin'),
    );
    if (!asset) {
      response.status(HttpStatus.NOT_FOUND).end();
      return;
    }
    const data = await this.storage.read(asset.storageKey);
    if (!data) {
      response.status(HttpStatus.NOT_FOUND).end();
      return;
    }
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Disposition', 'inline');
    response.type(asset.mimeType).send(data);
  }
}
