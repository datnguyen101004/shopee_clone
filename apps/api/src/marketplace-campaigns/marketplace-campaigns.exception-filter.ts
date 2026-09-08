import { Catch, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { AuthenticationFailedError, AuthorizationDeniedError } from '../auth/auth.errors';
import { MarketplaceCampaignError } from './marketplace-campaigns.errors';

@Catch()
export class MarketplaceCampaignExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (error instanceof MarketplaceCampaignError && error.retryAfterSeconds) response.header('Retry-After', String(error.retryAfterSeconds));
    const status = error instanceof MarketplaceCampaignError ? error.status : error instanceof AuthenticationFailedError ? 401 : error instanceof AuthorizationDeniedError ? 403 : 503;
    const code = error instanceof MarketplaceCampaignError ? error.code : status === 401 ? 'AUTHENTICATION_FAILED' : status === 403 ? 'AUTHORIZATION_DENIED' : 'CAMPAIGN_UNAVAILABLE';
    response.header('Cache-Control', 'no-store').type('application/problem+json').status(status).json({
      type: `https://shopee-clone.local/problems/${code.toLowerCase()}`,
      title: error instanceof MarketplaceCampaignError ? error.message : 'Campaign service unavailable',
      status, detail: error instanceof Error ? error.message : 'Campaign service is temporarily unavailable.', code,
      ...(error instanceof MarketplaceCampaignError && 'fields' in error ? { invalidParameters: (error as MarketplaceCampaignError & { fields: string[] }).fields } : {}),
      ...(error instanceof MarketplaceCampaignError && 'currentVersion' in error ? { currentVersion: (error as MarketplaceCampaignError & { currentVersion: number }).currentVersion } : {}),
    });
  }
}
