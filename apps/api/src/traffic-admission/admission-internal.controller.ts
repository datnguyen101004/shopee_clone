import { timingSafeEqual } from 'node:crypto';
import { Body, Controller, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { TrafficAdmissionService } from './traffic-admission.service';
import type { AdmissionGrantResult } from './admission-lambda';
import { ExternalRequest } from '../security/external-request.decorator';

interface AdmissionGrantBody {
  ticketId?: unknown;
  gateId?: unknown;
}

/**
 * Narrow adapter used by the LocalStack Lambda POC. It is deliberately not a
 * public buyer route: the shared secret is injected only into the Lambda and
 * the API. Production deployments can replace this adapter with a direct
 * Redis Lambda client without changing the SQS event contract.
 */
@Controller('internal/admission')
@ExternalRequest('internal-signed')
export class AdmissionInternalController {
  constructor(private readonly admission: TrafficAdmissionService) {}

  @Post('queue/grant')
  async grant(
    @Headers('x-admission-internal-secret') secret: string | undefined,
    @Body() body: AdmissionGrantBody,
  ): Promise<{ result: AdmissionGrantResult }> {
    const expected = process.env.ADMISSION_LAMBDA_SHARED_SECRET?.trim() ?? '';
    const received = secret?.trim() ?? '';
    const valid =
      expected.length > 0 &&
      received.length === expected.length &&
      timingSafeEqual(Buffer.from(received), Buffer.from(expected));
    if (!valid) throw new UnauthorizedException();
    if (
      typeof body.ticketId !== 'string' ||
      typeof body.gateId !== 'string' ||
      body.ticketId.length > 128 ||
      body.gateId.length > 64
    ) {
      return { result: 'TERMINAL' };
    }
    return { result: await this.admission.processQueueTicket(body.ticketId, body.gateId) };
  }
}
