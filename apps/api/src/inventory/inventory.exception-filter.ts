import { Catch, HttpStatus } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { AuthenticationFailedError, AuthorizationDeniedError } from '../auth/auth.errors';
import { InventoryIdempotencyConflictError, InventoryInsufficientError, InventoryNotFoundError, InventoryStaleError, InventoryUnavailableError, InventoryValidationError } from './inventory.errors';

@Catch()
export class InventoryExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    let status = HttpStatus.SERVICE_UNAVAILABLE; let title = 'Inventory unavailable'; let detail = 'Inventory service is unavailable'; const body: Record<string, unknown> = {};
    if (error instanceof InventoryValidationError) { status = 400; title = 'Invalid inventory request'; detail = 'Inventory request is invalid'; body.code = 'INVALID_INVENTORY_REQUEST'; body.invalidParameters = error.invalidParameters; }
    else if (error instanceof AuthenticationFailedError) { status = 401; title = 'Authentication failed'; detail = 'The account session could not be verified.'; body.code = 'AUTHENTICATION_FAILED'; }
    else if (error instanceof AuthorizationDeniedError) { status = 403; title = 'Authorization denied'; detail = 'The current account cannot manage seller inventory.'; body.code = 'AUTHORIZATION_DENIED'; }
    else if (error instanceof InventoryNotFoundError) { status = 404; title = 'Inventory not found'; detail = error.message; body.code = 'INVENTORY_NOT_FOUND'; }
    else if (error instanceof InventoryStaleError) { status = 412; title = 'Inventory version mismatch'; detail = error.message; body.code = 'INVENTORY_STALE'; body.currentVersion = error.currentVersion; }
    else if (error instanceof InventoryIdempotencyConflictError) { status = 409; title = 'Idempotency conflict'; detail = error.message; body.code = 'IDEMPOTENCY_CONFLICT'; }
    else if (error instanceof InventoryInsufficientError) { status = 409; title = 'Insufficient inventory'; detail = error.message; body.code = 'INVENTORY_INSUFFICIENT'; body.availableQuantity = error.availableQuantity; }
    else if (error instanceof InventoryUnavailableError) { status = 503; title = 'Inventory unavailable'; detail = error.message; body.code = 'INVENTORY_UNAVAILABLE'; }
    response.header('Content-Type', 'application/problem+json').header('Cache-Control', 'no-store').status(status).json({ type: `https://shopee-clone.local/problems/${title.toLowerCase().replaceAll(' ', '-')}`, title, status, detail, ...body });
  }
}
