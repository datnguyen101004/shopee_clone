import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { loadAuthConfig } from '../src/auth/auth.config';
import { AuthClock } from '../src/auth/auth-clock';
import {
  GOOGLE_IDENTITY_PROVIDER,
  type GoogleIdentityProvider,
} from '../src/auth/google-identity-provider';
import { CaptureRecoveryMailer, RECOVERY_MAILER } from '../src/auth/recovery-mailer';
import { configureApplication } from '../src/configure-application';
import { loadRepositoryEnvironment } from '../src/config/repository-environment';
import { MarketplaceRole, RoleAuditAction, RoleAuditSource } from '../src/generated/prisma/enums';
import { PrismaService } from '../src/prisma/prisma.service';

const databaseTest = process.env.RUN_AUTH_DATABASE_TESTS === '1' ? describe : describe.skip;
const origin =
  process.env.AUTH_ALLOWED_ORIGINS?.split(',')
    .map((value) => value.trim())
    .find(Boolean) ?? 'http://localhost:3000';
const email = 't11-postgres@example.test';
const initialPassword = 'T11 secure initial passphrase';
const replacementPassword = 'T11 secure replacement passphrase';
const googleEmail = 't11-google-postgres@example.test';
const collisionEmail = 't11-google-collision@example.test';

loadRepositoryEnvironment();
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

function responseCookie(response: {
  headers: Record<string, string | string[] | undefined>;
}): string {
  const header = response.headers['set-cookie'];
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) throw new Error('Expected an authentication cookie');
  return value.split(';', 1)[0]!;
}

function namedCookie(
  response: { headers: Record<string, string | string[] | undefined> },
  name: string,
): string {
  const header = response.headers['set-cookie'];
  const values = Array.isArray(header) ? header : header ? [header] : [];
  const value = values.find((entry) => entry.startsWith(`${name}=`));
  if (!value) throw new Error(`Expected ${name} cookie`);
  return value.split(';', 1)[0]!;
}

databaseTest('Authentication with isolated PostgreSQL', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mailer: CaptureRecoveryMailer;
  let now = new Date();
  const clock = { now: () => new Date(now) };
  const googleProvider: GoogleIdentityProvider = {
    authorizationUrl: ({ state }) => `https://accounts.google.test/authorize?state=${state}`,
    exchange: async ({ code }) => ({
      subject: code === 'collision' ? 'google-collision-subject' : 'google-postgres-subject',
      email: code === 'collision' ? collisionEmail : googleEmail,
      displayName: code === 'collision' ? 'Collision Buyer' : 'Google PostgreSQL Buyer',
    }),
  };

  beforeAll(async () => {
    mailer = new CaptureRecoveryMailer();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthClock)
      .useValue(clock)
      .overrideProvider(RECOVERY_MAILER)
      .useValue(mailer)
      .overrideProvider(GOOGLE_IDENTITY_PROVIDER)
      .useValue(googleProvider)
      .compile();
    app = moduleRef.createNestApplication();
    configureApplication(app, loadAuthConfig({ NODE_ENV: 'test' }));
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app?.close();
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
      roles: ['buyer'],
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
      include: {
        authSessions: true,
        passwordResetTokens: true,
        roleAssignments: true,
        roleAuditEvents: true,
      },
    });
    expect(persisted.passwordHash).toMatch(/^scrypt\$1\$/);
    expect(persisted.authSessions.some((session) => session.revokedAt !== null)).toBe(true);
    expect(persisted.passwordResetTokens).toHaveLength(2);
    expect(persisted.passwordResetTokens.some((token) => token.usedAt !== null)).toBe(true);
    expect(persisted.passwordResetTokens.some((token) => token.revokedAt !== null)).toBe(true);
    expect(persisted.roleAssignments.map(({ role }) => role)).toEqual([MarketplaceRole.BUYER]);
    expect(persisted.roleAuditEvents).toHaveLength(1);
  });

  it('creates one Google identity, reuses its subject, rejects replay, and refuses email linking', async () => {
    const starts = await Promise.all([
      request(app.getHttpServer()).get('/api/v1/auth/google/start?returnTo=%2F'),
      request(app.getHttpServer()).get('/api/v1/auth/google/start?returnTo=%2F'),
    ]);
    expect(starts.map(({ status }) => status)).toEqual([302, 302]);
    const callbacks = await Promise.all(
      starts.map((started) => {
        const state = new URL(started.headers.location as string).searchParams.get('state');
        return request(app.getHttpServer())
          .get(`/login/oauth2/code/google?code=new-google&state=${state}`)
          .set('Cookie', namedCookie(started, 'sc_google_login'));
      }),
    );
    expect(callbacks.map(({ status }) => status)).toEqual([302, 302]);
    expect(
      callbacks.every(({ headers }) => String(headers.location).includes('outcome=success')),
    ).toBe(true);
    expect(await prisma.user.count({ where: { email: googleEmail } })).toBe(1);
    const googleUser = await prisma.user.findUniqueOrThrow({
      where: { email: googleEmail },
      include: {
        externalIdentities: true,
        authSessions: true,
        roleAssignments: true,
        roleAuditEvents: true,
      },
    });
    expect(googleUser.passwordHash).toBeNull();
    expect(googleUser.externalIdentities).toHaveLength(1);
    expect(googleUser.externalIdentities[0]?.providerSubject).toBe('google-postgres-subject');
    expect(googleUser.authSessions).toHaveLength(2);
    expect(googleUser.roleAssignments.map(({ role }) => role)).toEqual([MarketplaceRole.BUYER]);
    expect(googleUser.roleAuditEvents).toHaveLength(1);

    const replayStart = starts[0]!;
    const replayState = new URL(replayStart.headers.location as string).searchParams.get('state');
    const replay = await request(app.getHttpServer())
      .get(`/login/oauth2/code/google?code=replayed&state=${replayState}`)
      .set('Cookie', namedCookie(replayStart, 'sc_google_login'))
      .expect(302);
    expect(replay.headers.location).toContain('outcome=failed');
    expect(await prisma.externalIdentity.count({ where: { userId: googleUser.id } })).toBe(1);

    await prisma.$transaction(async (transaction) => {
      const collisionUser = await transaction.user.create({
        data: {
          email: collisionEmail,
          displayName: 'Existing Password Buyer',
          passwordHash: 'locked',
        },
      });
      await transaction.userRoleAssignment.create({
        data: {
          userId: collisionUser.id,
          role: MarketplaceRole.BUYER,
          source: RoleAuditSource.SYSTEM,
        },
      });
      await transaction.roleAuditEvent.create({
        data: {
          targetUserId: collisionUser.id,
          role: MarketplaceRole.BUYER,
          action: RoleAuditAction.GRANT,
          source: RoleAuditSource.SYSTEM,
          reason: 'Buyer role assigned for collision test',
        },
      });
    });
    const collisionStart = await request(app.getHttpServer()).get(
      '/api/v1/auth/google/start?returnTo=%2F',
    );
    const collisionState = new URL(collisionStart.headers.location as string).searchParams.get(
      'state',
    );
    const collision = await request(app.getHttpServer())
      .get(`/login/oauth2/code/google?code=collision&state=${collisionState}`)
      .set('Cookie', namedCookie(collisionStart, 'sc_google_login'))
      .expect(302);
    expect(collision.headers.location).toContain('outcome=account-method-required');
    expect(await prisma.user.count({ where: { email: collisionEmail } })).toBe(1);
    expect(
      await prisma.externalIdentity.count({
        where: { providerSubject: 'google-collision-subject' },
      }),
    ).toBe(0);
  });
});
