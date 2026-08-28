import { Body, Controller, Get, Headers, Inject, NotFoundException, Param, PayloadTooLargeException, Post, Query, Req, Res, UnauthorizedException, UnsupportedMediaTypeException } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request, Response } from 'express';
import { createHash } from 'node:crypto';

import type { OperationDto, RegisterShipmentDto, ShipmentListQueryDto } from './carrier.dto';
import { DemoCarrierService } from './demo-carrier.service';
import { verifyInternalSignature } from './carrier-signature';
import { DEMO_CARRIER_MAX_BODY_BYTES } from '@shopee-clone/contracts';

@Controller('shipments')
export class CarrierOperationsController {
  constructor(@Inject(DemoCarrierService) private readonly carrier: DemoCarrierService) {}

  @Post()
  register(
    @Req() request: RawBodyRequest<Request>,
    @Body() body: RegisterShipmentDto,
    @Headers('x-demo-carrier-timestamp') timestamp?: string,
    @Headers('x-demo-carrier-key-id') keyId?: string,
    @Headers('x-demo-carrier-signature') signature?: string,
  ) {
    this.ensureSimulationAvailable();
    this.assertSignature(request, timestamp, keyId, signature);
    return this.carrier.register(body);
  }

  @Get()
  list(@Query() query: ShipmentListQueryDto, @Res({ passthrough: true }) response: Response) {
    this.ensureSimulationAvailable();
    const result = this.carrier.list(query);
    response.setHeader('ETag', result.etag);
    return result.body;
  }

  @Get(':shipmentReference')
  detail(@Param('shipmentReference') shipmentReference: string, @Res({ passthrough: true }) response: Response) {
    this.ensureSimulationAvailable();
    const body = this.carrier.detail(shipmentReference);
    response.setHeader('ETag', `"${createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 32)}"`);
    return body;
  }

  @Post(':shipmentReference/actions')
  action(@Param('shipmentReference') shipmentReference: string, @Body() request: OperationDto, @Headers('idempotency-key') commandId?: string) {
    this.ensureSimulationAvailable();
    if (commandId && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(commandId)) throw new UnauthorizedException('Invalid idempotency key');
    return this.carrier.action(shipmentReference, request, commandId);
  }

  private ensureSimulationAvailable(): void {
    if (process.env.NODE_ENV === 'production') throw new NotFoundException();
  }

  private assertSignature(request: RawBodyRequest<Request>, timestamp?: string, keyId?: string, signature?: string) {
    if ((request.rawBody?.length ?? 0) > DEMO_CARRIER_MAX_BODY_BYTES) throw new PayloadTooLargeException();
    if (!String(request.headers['content-type'] ?? '').toLowerCase().includes('application/json')) throw new UnsupportedMediaTypeException();
    const secret = process.env.DEMO_CARRIER_HMAC_ACTIVE_SECRET;
    if (secret && !verifyInternalSignature(secret, { timestamp, keyId, signature }, request.method, request.path, request.rawBody ?? Buffer.from('{}'))) {
      throw new UnauthorizedException('Invalid internal signature');
    }
  }
}
