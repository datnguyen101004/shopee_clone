import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';

import { ClickstreamController } from './clickstream.controller';
import { ClickstreamExceptionFilter } from './clickstream.exception-filter';

describe('Clickstream HTTP boundary', () => {
  it('returns the acceptance response and explicitly declares HTTP 202', async () => {
    const service = {
      capture: jest.fn().mockResolvedValue({
        eventId: '11111111-1111-4111-8111-111111111111',
        disposition: 'idempotent',
      }),
    };
    const controller = new ClickstreamController(service as never);
    await expect(controller.capture({ eventId: 'client-event' }, {} as never)).resolves.toEqual(
      expect.objectContaining({ disposition: 'idempotent' }),
    );
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, controller.capture)).toBe(202);
  });

  it('renders safe Problem Details for invalid and conflicting events', () => {
    const filter = new ClickstreamExceptionFilter();
    const response = {
      status: jest.fn().mockReturnThis(),
      type: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const host = {
      switchToHttp: () => ({ getResponse: () => response }),
    };
    filter.catch(
      new BadRequestException({
        code: 'CLICKSTREAM_VALIDATION_ERROR',
        detail: 'The clickstream event is invalid.',
        errors: [{ field: 'productId', message: 'Product is required.' }],
      }),
      host as never,
    );
    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.type).toHaveBeenCalledWith('application/problem+json');
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 400,
        code: 'CLICKSTREAM_VALIDATION_ERROR',
        errors: [{ field: 'productId', message: 'Product is required.' }],
      }),
    );

    filter.catch(
      new ConflictException({
        code: 'CLICKSTREAM_EVENT_CONFLICT',
        detail: 'Event ID is already associated with different content.',
      }),
      host as never,
    );
    expect(response.status).toHaveBeenLastCalledWith(409);
    expect(response.json).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 409, code: 'CLICKSTREAM_EVENT_CONFLICT' }),
    );
  });

  it('keeps prohibited payloads on the validation path', async () => {
    const service = {
      capture: jest.fn().mockRejectedValue(
        new BadRequestException({ code: 'CLICKSTREAM_VALIDATION_ERROR' }),
      ),
    };
    const controller = new ClickstreamController(service as never);
    await expect(
      controller.capture({ buyerId: 'spoofed' }, {} as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(service.capture).toHaveBeenCalledWith(
      { buyerId: 'spoofed' },
      expect.objectContaining({ userId: undefined }),
    );
  });

  it('does not expose internal errors in the fallback Problem Details', () => {
    const filter = new ClickstreamExceptionFilter();
    const response = {
      status: jest.fn().mockReturnThis(),
      type: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    filter.catch(
      new Error('postgres password=do-not-leak'),
      { switchToHttp: () => ({ getResponse: () => response }) } as never,
    );
    expect(response.status).toHaveBeenCalledWith(503);
    expect(JSON.stringify(response.json.mock.calls[0]?.[0])).not.toContain('do-not-leak');
  });

  it('preserves safe browser-mutation 403 status with sanitized Problem Details', () => {
    const filter = new ClickstreamExceptionFilter();
    const response = {
      status: jest.fn().mockReturnThis(),
      type: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    filter.catch(
      new ForbiddenException('internal authorization detail'),
      { switchToHttp: () => ({ getResponse: () => response }) } as never,
    );
    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.type).toHaveBeenCalledWith('application/problem+json');
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 403,
        code: 'CLICKSTREAM_FORBIDDEN',
        detail: 'Clickstream collection is forbidden.',
      }),
    );
    expect(JSON.stringify(response.json.mock.calls[0]?.[0])).not.toContain(
      'internal authorization detail',
    );
  });
});
