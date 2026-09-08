import { Body, Controller, Get, Header, Headers, Inject, Param, Post, Query, Req, Res, UseFilters, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { formatInventoryVersionEtag, parseInventoryAdjustmentPageQuery, parseInventoryAdjustmentRequest, parseInventoryIdempotencyKey, parseInventoryPageQuery, parseInventoryVersionEtag, type InventoryAdjustmentPage, type InventoryPage } from '@shopee-clone/contracts';
import type { Response } from 'express';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { RequireRoles, RolesGuard } from '../auth/role-authorization.guard';
import { InventoryExceptionFilter } from './inventory.exception-filter';
import { InventoryService } from './inventory.service';
import { InventoryValidationError } from './inventory.errors';

@ApiTags('seller inventory')
@ApiBearerAuth()
@Controller('seller/inventory')
@UseGuards(AuthGuard, RolesGuard)
@RequireRoles('seller')
@UseFilters(InventoryExceptionFilter)
export class InventoryController {
  constructor(@Inject(InventoryService) private readonly inventory: InventoryService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'List seller inventory balances' })
  async list(@Req() req: AuthenticatedRequest, @Query() query: Record<string, string | string[] | undefined>): Promise<InventoryPage> {
    const parsed = parseInventoryPageQuery(query);
    if (!parsed || !req.authUser) throw new InventoryValidationError(['query']);
    return this.inventory.list(req.authUser.id, parsed);
  }

  @Get(':variantId/adjustments')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'List immutable inventory adjustments' })
  async history(@Req() req: AuthenticatedRequest, @Param('variantId') variantId: string, @Query() query: Record<string, string | string[] | undefined>): Promise<InventoryAdjustmentPage> {
    const parsed = parseInventoryAdjustmentPageQuery(query);
    if (!parsed || !req.authUser) throw new InventoryValidationError(['query']);
    return this.inventory.history(req.authUser.id, variantId, parsed);
  }

  @Post(':variantId/adjustments')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Adjust seller inventory with optimistic concurrency' })
  async adjust(@Req() req: AuthenticatedRequest, @Param('variantId') variantId: string, @Headers('if-match') rawEtag: string | undefined, @Headers('idempotency-key') rawKey: string | undefined, @Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    const expectedVersion = parseInventoryVersionEtag(rawEtag); const key = parseInventoryIdempotencyKey(rawKey); const input = parseInventoryAdjustmentRequest(body);
    if (!req.authUser || expectedVersion === null || !key || !input) throw new InventoryValidationError([...(expectedVersion === null ? ['ifMatch'] : []), ...(!key ? ['idempotencyKey'] : []), ...(!input ? ['request'] : [])]);
    const adjustment = await this.inventory.adjust(req.authUser.id, variantId, expectedVersion, key, input);
    response.setHeader('ETag', formatInventoryVersionEtag(adjustment.inventoryVersion));
    return adjustment;
  }
}
