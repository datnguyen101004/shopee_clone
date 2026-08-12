import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { loadAuthConfig } from '../src/auth/auth.config';
import { AuthenticationFailedError } from '../src/auth/auth.errors';
import { AuthRateLimitedError } from '../src/auth/auth.errors';
import { AuthGuard, type AuthenticatedRequest } from '../src/auth/auth.guard';
import { AuthService } from '../src/auth/auth.service';
import { GoogleAuthService } from '../src/auth/google-auth.service';
import { configureApplication } from '../src/configure-application';
import { PrismaService } from '../src/prisma/prisma.service';

const authUser = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'buyer@example.com',
  displayName: 'Buyer Example',
  status: 'active' as const,
};
const session = {
  accessToken: 'header.payload.signature',
  expiresAt: '2026-08-12T12:15:00.000Z',
  user: authUser,
  refreshToken: 'a'.repeat(43),
};

describe('Authentication endpoints', () => {
  let app: INestApplication;
  const auth = {
    register: jest.fn(),
    login: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
    forgotPassword: jest.fn(),
    resetPassword: jest.fn(),
    loginWithGoogle: jest.fn(),
  };
  const googleAuth = {
    start: jest.fn(),
    complete: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ onModuleInit: jest.fn(), onModuleDestroy: jest.fn() })
      .overrideProvider(AuthService)
      .useValue(auth)
      .overrideProvider(GoogleAuthService)
      .useValue(googleAuth)
      .overrideGuard(AuthGuard)
      .useValue({
        canActivate(context: { switchToHttp(): { getRequest(): AuthenticatedRequest } }) {
          context.switchToHttp().getRequest().authUser = authUser;
          return true;
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    configureApplication(app, loadAuthConfig({ NODE_ENV: 'test' }));
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    auth.register.mockResolvedValue(session);
    auth.login.mockResolvedValue(session);
    auth.refresh.mockResolvedValue(session);
    auth.logout.mockResolvedValue(undefined);
    auth.forgotPassword.mockResolvedValue(undefined);
    auth.resetPassword.mockResolvedValue(undefined);
    googleAuth.start.mockResolvedValue({
      authorizationUrl: 'https://accounts.google.test/authorize',
      browserBinding: 'b'.repeat(43),
    });
    googleAuth.complete.mockResolvedValue({ outcome: 'success', returnTo: '/', session });
  });

  afterAll(async () => app.close());

  it('registers normalized credentials and emits only an HttpOnly refresh cookie', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('Origin', 'http://localhost:3000')
      .send({
        displayName: '  Buyer Example  ',
        email: '  Buyer@Example.COM ',
        password: 'Secure demo passphrase 2026',
      })
      .expect(201);
    expect(response.body).toEqual({
      accessToken: session.accessToken,
      expiresAt: session.expiresAt,
      user: authUser,
    });
    expect(JSON.stringify(response.body)).not.toContain(session.refreshToken);
    expect(response.headers['set-cookie']?.[0]).toContain('HttpOnly');
    expect(response.headers['set-cookie']?.[0]).toContain('SameSite=Lax');
    expect(response.headers['set-cookie']?.[0]).toContain('Path=/api/v1/auth');
    expect(auth.register).toHaveBeenCalledWith(
      {
        displayName: 'Buyer Example',
        email: 'buyer@example.com',
        password: 'Secure demo passphrase 2026',
      },
      expect.any(String),
    );
  });

  it('rejects extra fields and untrusted browser origins with Problem Details', async () => {
    const invalid = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('Origin', 'http://localhost:3000')
      .send({
        displayName: 'Buyer Example',
        email: 'buyer@example.com',
        password: 'Secure demo passphrase 2026',
        role: 'admin',
      })
      .expect(400);
    expect(invalid.headers['content-type']).toContain('application/problem+json');
    expect(invalid.body).toMatchObject({ status: 400, invalidParameters: ['request'] });

    const denied = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', 'https://attacker.example')
      .send({ email: 'buyer@example.com', password: 'wrong password' })
      .expect(403);
    expect(denied.body.type).toContain('authentication-origin-denied');
  });

  it('maps login failures uniformly and redacts internal error details', async () => {
    auth.login.mockRejectedValueOnce(new AuthenticationFailedError());
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'missing@example.com', password: 'postgres://user:secret@database' })
      .expect(401);
    expect(response.body).toMatchObject({ status: 401, title: 'Authentication failed' });
    expect(JSON.stringify(response.body)).not.toContain('postgres');
    expect(JSON.stringify(response.body)).not.toContain('secret');
  });

  it('maps rate limits and unexpected dependency failures without leaking secrets', async () => {
    auth.login.mockRejectedValueOnce(new AuthRateLimitedError(37));
    const limited = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'buyer@example.com', password: 'wrong password' })
      .expect(429);
    expect(limited.headers['retry-after']).toBe('37');
    expect(limited.body).toMatchObject({ status: 429, retryAfterSeconds: 37 });

    auth.login.mockRejectedValueOnce(new Error('postgres://user:secret@database'));
    const unavailable = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'buyer@example.com', password: 'another secret' })
      .expect(503);
    expect(unavailable.body).toMatchObject({ status: 503, title: 'Authentication unavailable' });
    expect(JSON.stringify(unavailable.body)).not.toContain('postgres');
    expect(JSON.stringify(unavailable.body)).not.toContain('secret');
  });

  it('rotates and clears refresh cookies without accepting a response-body refresh secret', async () => {
    const refreshed = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', `sc_refresh=${'z'.repeat(43)}`)
      .expect(200);
    expect(auth.refresh).toHaveBeenCalledWith('z'.repeat(43));
    expect(refreshed.body.refreshToken).toBeUndefined();

    const loggedOut = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', `sc_refresh=${'z'.repeat(43)}`)
      .expect(204);
    expect(auth.logout).toHaveBeenCalledWith('z'.repeat(43));
    expect(loggedOut.headers['set-cookie']?.[0]).toContain('Expires=Thu, 01 Jan 1970');
  });

  it('returns a safe current user and generic recovery responses', async () => {
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer header.payload.signature')
      .expect(200);
    expect(me.body).toEqual(authUser);

    const forgot = await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'unknown@example.com' })
      .expect(202);
    expect(forgot.body.message).toContain('If the account is eligible');

    await request(app.getHttpServer())
      .post('/api/v1/auth/reset-password')
      .send({ token: 'a'.repeat(43), password: 'Replacement passphrase 2026' })
      .expect(204);
  });

  it('uses the versioned start route and only the exact unprefixed callback', async () => {
    const started = await request(app.getHttpServer())
      .get('/api/v1/auth/google/start?returnTo=%2F')
      .expect(302);
    expect(started.headers.location).toBe('https://accounts.google.test/authorize');
    expect(started.headers['set-cookie']?.[0]).toContain('sc_google_login=');
    expect(started.headers['set-cookie']?.[0]).toContain('Path=/login/oauth2/code/google');

    const callback = await request(app.getHttpServer())
      .get('/login/oauth2/code/google?code=opaque&state=opaque')
      .set('Cookie', `sc_google_login=${'b'.repeat(43)}`)
      .expect(302);
    expect(callback.headers.location).toBe(
      'http://localhost:3000/login/google/complete?outcome=success&returnTo=%2F',
    );
    expect(callback.headers['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringContaining('sc_refresh='),
        expect.stringContaining('sc_google_login='),
      ]),
    );
    await request(app.getHttpServer()).get('/api/v1/login/oauth2/code/google').expect(404);
  });

  it('guards Google starts and sanitizes callback dependency failures', async () => {
    googleAuth.start.mockRejectedValueOnce(new AuthRateLimitedError(21));
    const limited = await request(app.getHttpServer()).get('/api/v1/auth/google/start').expect(429);
    expect(limited.body).toMatchObject({ status: 429, retryAfterSeconds: 21 });

    googleAuth.complete.mockRejectedValueOnce(
      new Error('client_secret=must-not-leak code=must-not-leak'),
    );
    const failed = await request(app.getHttpServer())
      .get('/login/oauth2/code/google?code=opaque&state=opaque')
      .set('Cookie', `sc_google_login=${'b'.repeat(43)}`)
      .expect(302);
    expect(failed.headers.location).toBe(
      'http://localhost:3000/login/google/complete?outcome=failed&returnTo=%2F',
    );
    expect(JSON.stringify(failed.headers)).not.toContain('must-not-leak');
  });
});
