import { AuthApiError, loginAccount, logoutAccount, requestPasswordReset } from './auth-api';

const session = {
  accessToken: 'header.payload.signature',
  expiresAt: '2026-08-12T12:15:00.000Z',
  user: {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'buyer@example.com',
    displayName: 'Buyer Example',
    status: 'active',
  },
};

describe('auth API client', () => {
  it('uses credentialed no-store requests and strictly parses a session', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(session), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await expect(
      loginAccount({ email: 'buyer@example.com', password: 'secret' }, fetcher),
    ).resolves.toEqual(session);
    expect(fetcher).toHaveBeenCalledWith(
      new URL('http://127.0.0.1:3001/api/v1/auth/login'),
      expect.objectContaining({ credentials: 'include', cache: 'no-store', method: 'POST' }),
    );
    const serialized = JSON.stringify(fetcher.mock.calls[0]?.[1]);
    expect(serialized).not.toContain('accessToken');
  });

  it('reduces malformed success and failure bodies to safe typed errors', async () => {
    const malformedSuccess = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ...session, refreshToken: 'must-not-be-here' }), {
        status: 200,
      }),
    );
    await expect(
      loginAccount({ email: 'buyer@example.com', password: 'secret' }, malformedSuccess),
    ).rejects.toMatchObject({ kind: 'contract' });

    const failed = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ database: 'postgres://secret' }), { status: 503 }),
      );
    await expect(requestPasswordReset({ email: 'buyer@example.com' }, failed)).rejects.toEqual(
      new AuthApiError('status', 503, null),
    );
  });

  it('accepts empty 204 responses for logout', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    await expect(logoutAccount(fetcher)).resolves.toBeUndefined();
  });
});
