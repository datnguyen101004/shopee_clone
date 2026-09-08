import { Inject, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedRequest } from '../auth/auth.guard';
import { TrafficAdmissionService } from './traffic-admission.service';
import { AdmissionInvalidError } from './traffic-admission.errors';
import { TRAFFIC_GATEWAY_CONTEXT_HEADER } from './gateway-route-inventory';

@Injectable()
export class TrafficAdmissionGuard implements CanActivate {
  constructor(@Inject(TrafficAdmissionService) private readonly admission: TrafficAdmissionService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest & Request & { admission?: unknown }>();
    const trustedGatewaySecret = process.env.TRAFFIC_GATEWAY_SHARED_SECRET?.trim();
    if (trustedGatewaySecret && request.headers[TRAFFIC_GATEWAY_CONTEXT_HEADER]?.toString() !== trustedGatewaySecret) throw new AdmissionInvalidError();
    const ifMatch = request.headers['if-match']?.toString() ?? '';
    const versionMatch = /^"cart-(0|[1-9][0-9]*)"$/.exec(ifMatch);
    // Flash Sale applicability is server classified from the selected cart. Ordinary-only
    // carts must bypass the waiting room even when the global gate is enabled.
    if (versionMatch && request.authUser?.id) {
      const requires = await this.admission.requiresAdmission(request.authUser.id, Number(versionMatch[1]));
      if (!requires) return true;
    } else if (request.path.includes('/payments/') || request.path.includes('/payment')) {
      return true;
    }
    const lease = await this.admission.verify(request.headers['x-admission-token']?.toString() ?? request.cookies?.sc_admission, request.authUser?.id ?? '', request.authSessionId ?? '');
    request.admissionLease = lease;
    return true;
  }
}
