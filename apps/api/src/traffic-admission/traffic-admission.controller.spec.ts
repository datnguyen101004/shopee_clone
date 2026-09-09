import type { AuthenticatedRequest } from '../auth/auth.guard';
import { AdmissionValidationError } from './traffic-admission.errors';
import { TrafficAdmissionController } from './traffic-admission.controller';
import type { TrafficAdmissionService } from './traffic-admission.service';

describe('TrafficAdmissionController lifecycle endpoints', () => {
  const admission = {
    relinquish: jest.fn(),
    heartbeat: jest.fn(),
  } as unknown as TrafficAdmissionService;
  const request = {
    authUser: { id: 'buyer-1' },
    authSessionId: 'session-1',
    cookies: { sc_admission: 'opaque-token' },
  } as unknown as AuthenticatedRequest;
  const ticketId = '00000000-0000-4000-8000-000000000001';
  const browserInstanceId = '00000000-0000-4000-8000-000000000002';

  beforeEach(() => jest.clearAllMocks());

  it('delegates explicit admitted relinquishment with the HttpOnly cookie token', async () => {
    const controller = new TrafficAdmissionController(admission);

    await controller.relinquish(request, { ticketId, browserInstanceId, mode: 'EXPLICIT' });

    expect(admission.relinquish).toHaveBeenCalledWith(
      'buyer-1',
      'session-1',
      ticketId,
      browserInstanceId,
      'opaque-token',
      'EXPLICIT',
    );
  });

  it('delegates page-leave grace and heartbeat without exposing the token in the body', async () => {
    const controller = new TrafficAdmissionController(admission);

    await controller.relinquish(request, { ticketId, browserInstanceId, mode: 'PAGE_LEAVE' });
    await controller.heartbeat(request, { ticketId, browserInstanceId });

    expect(admission.relinquish).toHaveBeenCalledWith(
      'buyer-1',
      'session-1',
      ticketId,
      browserInstanceId,
      'opaque-token',
      'PAGE_LEAVE',
    );
    expect(admission.heartbeat).toHaveBeenCalledWith(
      'buyer-1',
      'session-1',
      ticketId,
      browserInstanceId,
      'opaque-token',
    );
  });

  it('rejects malformed lifecycle identifiers before Redis is touched', async () => {
    const controller = new TrafficAdmissionController(admission);

    await expect(
      controller.relinquish(request, { ticketId: 'not-a-uuid', browserInstanceId }),
    ).rejects.toBeInstanceOf(AdmissionValidationError);
    await expect(
      controller.heartbeat(request, { ticketId, browserInstanceId: 'not-a-uuid' }),
    ).rejects.toBeInstanceOf(AdmissionValidationError);
    expect(admission.relinquish).not.toHaveBeenCalled();
    expect(admission.heartbeat).not.toHaveBeenCalled();
  });
});
