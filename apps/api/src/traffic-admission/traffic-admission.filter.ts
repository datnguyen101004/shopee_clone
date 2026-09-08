import { Catch, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { TrafficAdmissionError } from './traffic-admission.errors';

@Catch(TrafficAdmissionError)
export class TrafficAdmissionFilter implements ExceptionFilter {
  catch(error: TrafficAdmissionError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (error.retryAfterSeconds) response.setHeader('Retry-After', String(error.retryAfterSeconds));
    response.status(error.status).type('application/problem+json').setHeader('Cache-Control', 'no-store').json({ type: `https://shopee-clone.local/problems/${error.code.toLowerCase()}`, title: error.message, status: error.status, detail: error.message, code: error.code });
  }
}
