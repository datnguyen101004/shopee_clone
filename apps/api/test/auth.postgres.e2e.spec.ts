import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { loadAuthConfig } from '../src/auth/auth.config';
import { AuthClock } from '../src/auth/auth-clock';
import { CaptureRecoveryMailer, RECOVERY_MAILER } from '../src/auth/recovery-mailer';
import { configureApplication } from '../src/configure-application';
import { PrismaService } from '../src/prisma/prisma.service';

const databaseTest = process.env.RUN_AUTH_DATABASE_TESTS === '1' ? describe : describe.skip;
const origin =
  process.env.AUTH_ALLOWED_ORIGINS?.split(',')
    .map((value) => value.trim())
    .find(Boolean) ?? 'http://localhost:3000';
const email = 't11-postgres@example.test';
const initialPassword = 'T11 secure initial passphrase';
const replacementPassword = 'T11 secure replacement passphrase';

function responseCookie(response: {
  headers: Record<string, string | string[] | undefined>;
}): string {
  const header = response.headers['set-cookie'];
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) throw new Error('Expected an authentication cookie');
  return value.split(';', 1)[0]!;
}

databaseTest('Authentication with isolated PostgreSQL', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mailer: CaptureRecoveryMailer;
  let now = new Date();
  const clock = { now: () => new Date(now) };

  beforeAll(async () => {
    mailer = new CaptureRecoveryMailer();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthClock)
      .useValue(clock)
      .overrideProvider(RECOVERY_MAILER)
      .useValue(mailer)
      .compile();
    app = moduleRef.createNestApplication();
    configureApplication(app, loadAuthConfig({ NODE_ENV: 'test' }));
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.user.deleteMany({ where: { email } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it('persists normalized credentials and enforces refresh/reset lifecycle rules', async () => {
    const registrations = await Promise.all(
      ['  T11-Postgres@Example.Test ', email].map((submittedEmail) =>
        request(app.getHttpServer()).post('/api/v1/auth/register').set('Origin', origin).send({
          displayName: '  T11 PostgreSQL Buyer  ',
          email: submittedEmail,
          password: initialPassword,
        }),
      ),
    );
    expect(registrations.map(({ status }) => status).sort()).toEqual([201, 409]);
    const registered = registrations.find(({ status }) => status === 201)!;
    const originalCookie = responseCookie(registered);
    expect(registered.body.user).toMatchObject({
      email,
      displayName: 'T11 PostgreSQL Buyer',
    });
    expect(await prisma.user.findUniqueOrThrow({ where: { email } })).toMatchObject({
      email,
      displayName: 'T11 PostgreSQL Buyer',
    });

    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${registered.body.accessToken as string}`)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer malformed.token.value')
      .expect(401);

    const rotations = await Promise.all(
      [0, 1].map(() =>
        request(app.getHttpServer())
          .post('/api/v1/auth/refresh')
          .set('Origin', origin)
          .set('Cookie', originalCookie),
      ),
    );
    expect(rotations.map(({ status }) => status).sort()).toEqual([200, 401]);
    const rotated = rotations.find(({ status }) => status === 200)!;
    const successorCookie = responseCookie(rotated);
    const concurrentReplay = rotations.find(({ status }) => status === 401)!;
    expect(concurrentReplay.headers['set-cookie']).toBeUndefined();

    now = new Date(now.getTime() + 6_000);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Origin', origin)
      .set('Cookie', originalCookie)
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Origin', origin)
      .set('Cookie', successorCookie)
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Origin', origin)
      .expect(204);
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Origin', origin)
      .expect(204);

    const loggedIn = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ email, password: initialPassword })
      .expect(200);
    const passwordChangeCookie = responseCookie(loggedIn);

    await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .set('Origin', origin)
      .send({ email })
      .expect(202);
    const priorResetToken = new URL(mailer.latest()!.resetUrl).searchParams.get('token');
    await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .set('Origin', origin)
      .send({ email })
      .expect(202);
    const resetUrl = mailer.latest()?.resetUrl;
    expect(resetUrl).toBeDefined();
    const resetToken = new URL(resetUrl!).searchParams.get('token');
    expect(resetToken).toBeTruthy();

    await request(app.getHttpServer())
      .post('/api/v1/auth/reset-password')
      .set('Origin', origin)
      .send({ token: priorResetToken, password: replacementPassword })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/v1/auth/reset-password')
      .set('Origin', origin)
      .send({ token: resetToken, password: replacementPassword })
      .expect(204);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Origin', origin)
      .set('Cookie', passwordChangeCookie)
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ email, password: initialPassword })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ email, password: replacementPassword })
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/auth/reset-password')
      .set('Origin', origin)
      .send({ token: resetToken, password: initialPassword })
      .expect(400);

    const persisted = await prisma.user.findUniqueOrThrow({
      where: { email },
      include: { authSessions: true, passwordResetTokens: true },
    });
    expect(persisted.passwordHash).toMatch(/^scrypt\$1\$/);
    expect(persisted.authSessions.some((session) => session.revokedAt !== null)).toBe(true);
    expect(persisted.passwordResetTokens).toHaveLength(2);
    expect(persisted.passwordResetTokens.some((token) => token.usedAt !== null)).toBe(true);
    expect(persisted.passwordResetTokens.some((token) => token.revokedAt !== null)).toBe(true);
  });
});
