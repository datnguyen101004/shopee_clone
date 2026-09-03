import { SetMetadata } from '@nestjs/common';

export const EXTERNAL_REQUEST_CLASS = 'external-request-class';
export type ExternalRequestClass = 'google-oauth-callback' | 'provider-signed-webhook';

export const ExternalRequest = (requestClass: ExternalRequestClass) =>
  SetMetadata(EXTERNAL_REQUEST_CLASS, requestClass);
