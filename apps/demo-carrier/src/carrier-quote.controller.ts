import { Body, Controller, Headers, Inject, NotFoundException, PayloadTooLargeException, Post, Req, UnauthorizedException, UnsupportedMediaTypeException } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';

import type { QuoteRequestDto } from './carrier.dto';
import { DEMO_CARRIER_MAX_BODY_BYTES } from '@shopee-clone/contracts';
import { DemoCarrierService } from './demo-carrier.service';
import { verifyInternalSignature } from './carrier-signature';

@Controller('quotes')
export class CarrierQuoteController {
  constructor(@Inject(DemoCarrierService) private readonly carrier: DemoCarrierService) {}

  @Post()
  quote(
    @Req() request: RawBodyRequest<Request>,
    @Body() body: QuoteRequestDto,
    @Headers('x-demo-carrier-timestamp') timestamp?: string,
    @Headers('x-demo-carrier-key-id') keyId?: string,
    @Headers('x-demo-carrier-signature') signature?: string,
  ) {
    this.ensureSimulationAvailable();
    this.assertSignature(request, timestamp, keyId, signature);
    return this.carrier.quote(body);
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
