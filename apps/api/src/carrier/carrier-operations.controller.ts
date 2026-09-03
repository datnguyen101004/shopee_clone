import { BadRequestException, Body, Controller, Get, Headers, Inject, Param, Post, Query, Res, UseFilters, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { createHash } from 'node:crypto';
import {
  isDemoCarrierOperationRequest,
  isDemoCarrierServiceCode,
  isDemoCarrierShipmentState,
  type DemoCarrierOperationRequest,
  type DemoCarrierShipmentListQuery,
} from '@shopee-clone/contracts';
import { AuthGuard } from '../auth/auth.guard';
import { AuthExceptionFilter } from '../auth/auth-exception.filter';
import { RequireRoles, RolesGuard } from '../auth/role-authorization.guard';
import { CarrierOperationsService } from './carrier-operations.service';

@Controller('carrier/operations')
@UseFilters(AuthExceptionFilter)
@UseGuards(AuthGuard, RolesGuard)
@RequireRoles('carrier_operator')
export class CarrierOperationsController {
  constructor(@Inject(CarrierOperationsService) private readonly operations: CarrierOperationsService) {}

  @Get('dashboard')
  dashboard() {
    return this.operations.dashboard();
  }

  @Get('shipments')
  list(@Query() query: DemoCarrierShipmentListQuery, @Res({ passthrough: true }) response: Response) {
    if (query.status && !isDemoCarrierShipmentState(query.status)) throw new BadRequestException('Invalid shipment status filter');
    if (query.service && !isDemoCarrierServiceCode(query.service)) throw new BadRequestException('Invalid shipment service filter');
    if ((query.from && !Number.isFinite(Date.parse(query.from))) || (query.to && !Number.isFinite(Date.parse(query.to)))) throw new BadRequestException('Invalid shipment date filter');
    const normalized: DemoCarrierShipmentListQuery = {
      reference: query.reference,
      status: query.status && isDemoCarrierShipmentState(query.status) ? query.status : undefined,
      service: query.service,
      from: query.from,
      to: query.to,
      limit: Math.min(Math.max(Number(query.limit ?? 50) || 50, 1), 50),
      cursor: query.cursor,
    };
    return this.operations.list(normalized).then((result) => {
      response.setHeader('ETag', result.etag);
      return result.body;
    });
  }

  @Get('shipments/:trackingCode')
  async detail(@Param('trackingCode') trackingCode: string, @Res({ passthrough: true }) response: Response) {
    const body = await this.operations.detail(trackingCode);
    response.setHeader('ETag', `"${createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 32)}"`);
    return body;
  }

  @Post('shipments/:trackingCode/actions')
  action(@Param('trackingCode') trackingCode: string, @Body() body: DemoCarrierOperationRequest, @Headers('idempotency-key') idempotencyKey?: string) {
    if (!isDemoCarrierOperationRequest(body)) throw new BadRequestException('Invalid carrier operation request');
    if (!idempotencyKey || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) throw new BadRequestException('Invalid idempotency key');
    return this.operations.action(trackingCode, body, idempotencyKey);
  }

}
