import { AuthenticationFailedError, AuthorizationDeniedError } from '../auth/auth.errors';
import { InventoryExceptionFilter } from './inventory.exception-filter';

function fixture() {
  const response = {
    header: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  const host = { switchToHttp: () => ({ getResponse: () => response }) };
  return { filter: new InventoryExceptionFilter(), response, host: host as never };
}

describe('InventoryExceptionFilter', () => {
  it('preserves authentication and role errors instead of turning them into inventory 500s', () => {
    const auth = fixture();
    auth.filter.catch(new AuthenticationFailedError(), auth.host);
    expect(auth.response.status).toHaveBeenCalledWith(401);
    expect(auth.response.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'AUTHENTICATION_FAILED' }));

    const role = fixture();
    role.filter.catch(new AuthorizationDeniedError(), role.host);
    expect(role.response.status).toHaveBeenCalledWith(403);
    expect(role.response.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'AUTHORIZATION_DENIED' }));
  });

  it('reports unexpected inventory failures as retryable service unavailable', () => {
    const { filter, response, host } = fixture();
    filter.catch(new Error('database unavailable'), host);
    expect(response.status).toHaveBeenCalledWith(503);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ title: 'Inventory unavailable', status: 503 }));
  });
});
