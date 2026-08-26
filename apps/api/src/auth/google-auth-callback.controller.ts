import { Controller, Get, Header, HttpStatus, Inject, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { AUTH_CONFIG, type AuthConfig } from './auth.config';
import { refreshCookieOptions } from './auth-cookie';
import { requestSource } from './auth-origin.guard';
import { expiredGoogleTransactionCookieOptions } from './google-auth-cookie';
import { GoogleAuthService } from './google-auth.service';
import { ExternalRequest } from '../security/external-request.decorator';

function queryString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function cookie(request: Request, name: string): string | undefined {
  const cookies = request.cookies as Record<string, unknown> | undefined;
  const value = cookies?.[name];
  return typeof value === 'string' ? value : undefined;
}

@ApiTags('authentication')
@Controller()
export class GoogleAuthCallbackController {
  constructor(
    @Inject(GoogleAuthService) private readonly googleAuth: GoogleAuthService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  @Get('login/oauth2/code/google')
  @ExternalRequest('google-oauth-callback')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  @ApiOperation({ summary: 'Consume the exact registered Google OAuth callback' })
  async callback(@Req() request: Request, @Res() response: Response): Promise<void> {
    let outcome:
      | 'success'
      | 'cancelled'
      | 'failed'
      | 'account-method-required'
      | 'account-and-shop-disabled' = 'failed';
    let returnTo = '/';
    try {
      const completion = await this.googleAuth.complete({
        state: queryString(request.query.state),
        code: queryString(request.query.code),
        providerError: queryString(request.query.error),
        browserBinding: cookie(request, this.config.google.cookieName),
        requestSource: requestSource(request, this.config.trustProxy),
      });
      outcome = completion.outcome;
      returnTo = completion.returnTo;
      if (completion.outcome === 'success') {
        response.cookie(
          this.config.refreshCookieName,
          completion.session.refreshToken,
          refreshCookieOptions(this.config),
        );
      }
    } catch {
      outcome = 'failed';
    }
    response.cookie(
      this.config.google.cookieName,
      '',
      expiredGoogleTransactionCookieOptions(this.config),
    );
    const destination = new URL('/login/google/complete', this.config.webBaseUrl);
    destination.searchParams.set('outcome', outcome);
    destination.searchParams.set('returnTo', returnTo);
    response.redirect(HttpStatus.FOUND, destination.toString());
  }
}
