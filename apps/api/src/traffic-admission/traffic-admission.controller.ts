import { Body, Controller, Delete, Get, Header, Headers, HttpCode, Inject, Post, Query, Req, Res, UseFilters, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { AuthOriginGuard } from '../auth/auth-origin.guard';
import { TrafficAdmissionService } from './traffic-admission.service';
import { TrafficAdmissionFilter } from './traffic-admission.filter';
import { AdmissionValidationError } from './traffic-admission.errors';

interface AdmissionLifecycleBody {
  ticketId?: unknown;
  browserInstanceId?: unknown;
  mode?: unknown;
}

@Controller('admission/checkout')
@ApiTags('admission')
@ApiBearerAuth()
@UseGuards(AuthGuard, AuthOriginGuard)
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
  private publicStatus(status: Awaited<ReturnType<TrafficAdmissionService['getStatus']>>): Omit<Awaited<ReturnType<TrafficAdmissionService['getStatus']>>, 'token'> {
    const { token, ...safe } = status;
    void token;
    return safe;
  }

  @Post('tickets') @ApiOperation({ summary: 'Join the Flash Sale checkout waiting room' }) @ApiHeader({ name: 'Idempotency-Key', required: true }) @HttpCode(200) @Header('Cache-Control', 'private, no-store') async enqueue(@Req() request: AuthenticatedRequest, @Headers('idempotency-key') idempotencyKey: string | undefined, @Res({ passthrough: true }) response: Response) {
    if (!idempotencyKey || !/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)) throw new AdmissionValidationError();
    if (!(await this.admission.requiresAdmissionForCurrentCart(request.authUser!.id))) {
      return { gateId: 'checkout', ticketId: 'bypass', state: 'ADMITTED', retryAfterSeconds: 0, leaseExpiresAt: null, message: 'Giỏ hàng thường không cần phòng chờ.' };
    }
    const status = await this.admission.enqueue(request.authUser!.id, request.authSessionId!, 'checkout', idempotencyKey);
    this.writeAdmissionCookie(response, status.token);
    return this.publicStatus(status);
  }
  @Get('status') @ApiOperation({ summary: 'Read the owned waiting-room ticket' }) @Header('Cache-Control', 'private, no-store') async status(@Req() request: AuthenticatedRequest, @Query('ticketId') ticketId: string | undefined, @Res({ passthrough: true }) response: Response) {
    if (ticketId && !/^[0-9a-f-]{36}$/.test(ticketId)) throw new AdmissionValidationError();
    const status = await this.admission.getStatus(request.authUser!.id, request.authSessionId!, ticketId);
    this.writeAdmissionCookie(response, status.token);
    return this.publicStatus(status);
  }
  @Delete('ticket') @ApiOperation({ summary: 'Cancel an ungranted waiting-room ticket' }) @HttpCode(204) async leave(@Req() request: AuthenticatedRequest, @Query('ticketId') ticketId: string): Promise<void> {
    if (!/^[0-9a-f-]{36}$/.test(ticketId)) throw new AdmissionValidationError();
    await this.admission.leave(request.authUser!.id, request.authSessionId!, ticketId);
  }

  @Post('relinquish')
  @ApiOperation({ summary: 'Release an owned admitted lease or schedule page-leave release' })
  @ApiBody({ schema: { type: 'object', required: ['ticketId', 'browserInstanceId'], properties: { ticketId: { type: 'string', format: 'uuid' }, browserInstanceId: { type: 'string', format: 'uuid' }, mode: { type: 'string', enum: ['EXPLICIT', 'PAGE_LEAVE'] } } } })
  @HttpCode(204)
  async relinquish(
    @Req() request: AuthenticatedRequest,
    @Body() body: AdmissionLifecycleBody,
  ): Promise<void> {
    if (
      typeof body.ticketId !== 'string' ||
      !/^[0-9a-f-]{36}$/i.test(body.ticketId) ||
      typeof body.browserInstanceId !== 'string' ||
      !/^[0-9a-f-]{36}$/i.test(body.browserInstanceId) ||
      (body.mode !== undefined && body.mode !== 'EXPLICIT' && body.mode !== 'PAGE_LEAVE')
    ) throw new AdmissionValidationError();
    await this.admission.relinquish(
      request.authUser!.id,
      request.authSessionId!,
      body.ticketId,
      body.browserInstanceId,
      request.cookies?.sc_admission,
      body.mode === 'PAGE_LEAVE' ? 'PAGE_LEAVE' : 'EXPLICIT',
    );
  }

  @Post('heartbeat')
  @ApiOperation({ summary: 'Cancel a matching pending page-leave release without renewing the lease' })
  @ApiBody({ schema: { type: 'object', required: ['ticketId', 'browserInstanceId'], properties: { ticketId: { type: 'string', format: 'uuid' }, browserInstanceId: { type: 'string', format: 'uuid' } } } })
  @HttpCode(204)
  async heartbeat(
    @Req() request: AuthenticatedRequest,
    @Body() body: AdmissionLifecycleBody,
  ): Promise<void> {
    if (
      typeof body.ticketId !== 'string' ||
      !/^[0-9a-f-]{36}$/i.test(body.ticketId) ||
      typeof body.browserInstanceId !== 'string' ||
      !/^[0-9a-f-]{36}$/i.test(body.browserInstanceId)
    ) throw new AdmissionValidationError();
    await this.admission.heartbeat(
      request.authUser!.id,
      request.authSessionId!,
      body.ticketId,
      body.browserInstanceId,
      request.cookies?.sc_admission,
    );
  }
}
