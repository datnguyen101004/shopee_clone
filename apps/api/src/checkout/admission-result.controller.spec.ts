import type { AuthenticatedRequest } from '../auth/auth.guard';
import { CheckoutValidationError } from './checkout.errors';
import { AdmissionResultController } from './admission-result.controller';
import type { CheckoutService } from './checkout.service';

describe('AdmissionResultController', () => {
  const checkout = {
    getPurchaseByIdempotency: jest.fn(),
  } as unknown as CheckoutService;
  const request = { authUser: { id: 'buyer-1' } } as unknown as AuthenticatedRequest;

  beforeEach(() => jest.clearAllMocks());

  it('rejects a result lookup key before it reaches Prisma', () => {
    const controller = new AdmissionResultController(checkout);
    expect(() => controller.result(request, 'order-not-a-uuid')).toThrow(CheckoutValidationError);
    expect(checkout.getPurchaseByIdempotency).not.toHaveBeenCalled();
  });

  it('delegates a valid UUID key to the owned purchase lookup', async () => {
    const result = { purchase: { id: 'purchase-1' } };
    checkout.getPurchaseByIdempotency = jest.fn().mockResolvedValue(result);
    const controller = new AdmissionResultController(checkout);
    const key = '00000000-0000-4000-8000-000000000001';

    await expect(controller.result(request, key)).resolves.toBe(result);
    expect(checkout.getPurchaseByIdempotency).toHaveBeenCalledWith('buyer-1', key);
  });
});
