import { Controller, Delete, Get, Header, Headers, HttpCode, Inject, Post, Query, Req, Res, UseFilters, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { TrafficAdmissionService } from './traffic-admission.service';
import { TrafficAdmissionFilter } from './traffic-admission.filter';
import { AdmissionValidationError } from './traffic-admission.errors';

@Controller('admission/checkout')
@ApiTags('admission')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@UseFilters(TrafficAdmissionFilter)
export class TrafficAdmissionController {
  constructor(@Inject(TrafficAdmissionService) private readonly admission: TrafficAdmissionService) {}
  private writeAdmissionCookie(response: Response, token?: string): void {
    if (!token) return;
    response.cookie('sc_admission', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 300_000,
      path: '/',
    });
  }

  @Post('tickets') @ApiOperation({ summary: 'Join the Flash Sale checkout waiting room' }) @ApiHeader({ name: 'Idempotency-Key', required: true }) @HttpCode(200) @Header('Cache-Control', 'private, no-store') async enqueue(@Req() request: AuthenticatedRequest, @Headers('idempotency-key') idempotencyKey: string | undefined, @Res({ passthrough: true }) response: Response) {
    if (!idempotencyKey || !/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)) throw new AdmissionValidationError();
    if (!(await this.admission.requiresAdmissionForCurrentCart(request.authUser!.id))) {
      return { gateId: 'checkout', ticketId: 'bypass', state: 'ADMITTED', retryAfterSeconds: 0, leaseExpiresAt: null, message: 'Giỏ hàng thường không cần phòng chờ.' };
    }
    const status = await this.admission.enqueue(request.authUser!.id, request.authSessionId!, 'checkout', idempotencyKey);
    this.writeAdmissionCookie(response, status.token);
    return status;
  }
  @Get('status') @ApiOperation({ summary: 'Read the owned waiting-room ticket' }) @Header('Cache-Control', 'private, no-store') async status(@Req() request: AuthenticatedRequest, @Query('ticketId') ticketId: string | undefined, @Res({ passthrough: true }) response: Response) {
    if (ticketId && !/^[0-9a-f-]{36}$/.test(ticketId)) throw new AdmissionValidationError();
    const status = await this.admission.getStatus(request.authUser!.id, request.authSessionId!, ticketId);
    this.writeAdmissionCookie(response, status.token);
    return status;
  }
  @Delete('ticket') @ApiOperation({ summary: 'Cancel an ungranted waiting-room ticket' }) @HttpCode(204) async leave(@Req() request: AuthenticatedRequest, @Query('ticketId') ticketId: string): Promise<void> {
    if (!/^[0-9a-f-]{36}$/.test(ticketId)) throw new AdmissionValidationError();
    await this.admission.leave(request.authUser!.id, request.authSessionId!, ticketId);
  }
}
