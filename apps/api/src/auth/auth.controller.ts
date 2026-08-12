import type { AuthSessionResponse, AuthUser } from '@shopee-clone/contracts';
import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { AUTH_CONFIG, type AuthConfig } from './auth.config';
import { expiredRefreshCookieOptions, refreshCookieOptions } from './auth-cookie';
// DTO classes must remain runtime values for Nest validation metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ForgotPasswordDto, LoginDto, RegisterDto, ResetPasswordDto } from './auth.dto';
import { AuthExceptionFilter } from './auth-exception.filter';
import { RefreshSessionFailedError } from './auth.errors';
import { AuthGuard, type AuthenticatedRequest } from './auth.guard';
import { AuthOriginGuard, requestSource } from './auth-origin.guard';
import { type AuthSessionResult, AuthService } from './auth.service';

function publicSession(result: AuthSessionResult): AuthSessionResponse {
  return {
    accessToken: result.accessToken,
    expiresAt: result.expiresAt,
    user: result.user,
  };
}

function refreshCookie(request: Request, name: string): string | undefined {
  const cookies = request.cookies as Record<string, unknown> | undefined;
  const value = cookies?.[name];
  return typeof value === 'string' ? value : undefined;
}

@ApiTags('authentication')
@ApiCookieAuth('sc_refresh')
@Controller('auth')
@UseFilters(AuthExceptionFilter)
@UseGuards(AuthOriginGuard)
export class AuthController {
  constructor(
    @Inject(AuthService)
    private readonly auth: AuthService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  @Post('register')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Register an email account and start a refresh session' })
  @ApiResponse({ status: 201, description: 'Authenticated session created' })
  async register(
    @Body() input: RegisterDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthSessionResponse> {
    const session = await this.auth.register(input, requestSource(request, this.config.trustProxy));
    response.cookie(
      this.config.refreshCookieName,
      session.refreshToken,
      refreshCookieOptions(this.config),
    );
    return publicSession(session);
  }

  @Post('login')
  @Header('Cache-Control', 'no-store')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate email credentials' })
  async login(
    @Body() input: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthSessionResponse> {
    const session = await this.auth.login(input, requestSource(request, this.config.trustProxy));
    response.cookie(
      this.config.refreshCookieName,
      session.refreshToken,
      refreshCookieOptions(this.config),
    );
    return publicSession(session);
  }

  @Post('refresh')
  @Header('Cache-Control', 'no-store')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate a refresh session and issue a new access token' })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthSessionResponse> {
    try {
      const session = await this.auth.refresh(
        refreshCookie(request, this.config.refreshCookieName),
      );
      response.cookie(
        this.config.refreshCookieName,
        session.refreshToken,
        refreshCookieOptions(this.config),
      );
      return publicSession(session);
    } catch (error) {
      if (!(error instanceof RefreshSessionFailedError) || error.clearCookie) {
        response.cookie(
          this.config.refreshCookieName,
          '',
          expiredRefreshCookieOptions(this.config),
        );
      }
      throw error;
    }
  }

  @Post('logout')
  @Header('Cache-Control', 'no-store')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Refresh session revoked and cookie expired' })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(refreshCookie(request, this.config.refreshCookieName));
    response.cookie(this.config.refreshCookieName, '', expiredRefreshCookieOptions(this.config));
  }

  @Get('me')
  @Header('Cache-Control', 'no-store')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Return the safe authenticated user projection' })
  me(@Req() request: AuthenticatedRequest): AuthUser {
    return request.authUser!;
  }

  @Post('forgot-password')
  @Header('Cache-Control', 'no-store')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Request a generic password recovery message' })
  async forgotPassword(
    @Body() input: ForgotPasswordDto,
    @Req() request: Request,
  ): Promise<{ message: string }> {
    await this.auth.forgotPassword(input.email, requestSource(request, this.config.trustProxy));
    return { message: 'If the account is eligible, password recovery instructions were sent.' };
  }

  @Post('reset-password')
  @Header('Cache-Control', 'no-store')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Password changed and prior sessions revoked' })
  async resetPassword(@Body() input: ResetPasswordDto, @Req() request: Request): Promise<void> {
    await this.auth.resetPassword(
      input.token,
      input.password,
      requestSource(request, this.config.trustProxy),
    );
  }
}
