import type { BuyerProfile, ShippingAddress, ShippingAddressList } from '@shopee-clone/contracts';
import type { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AccountAddressNotFoundError } from '../src/account/account.errors';
import { AccountService } from '../src/account/account.service';
import { AppModule } from '../src/app.module';
import { loadAuthConfig } from '../src/auth/auth.config';
import { AuthenticationFailedError } from '../src/auth/auth.errors';
import { AuthGuard, type AuthenticatedRequest } from '../src/auth/auth.guard';
import { configureApplication } from '../src/configure-application';
import { PrismaService } from '../src/prisma/prisma.service';

const origin = 'http://localhost:3000';
const user = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'buyer@example.test',
  displayName: 'Buyer Example',
  status: 'active' as const,
  roles: ['buyer'] as ['buyer'],
};
const profile: BuyerProfile = { ...user, phoneNumber: '0912345678' };
const address: ShippingAddress = {
  id: '00000000-0000-4000-8000-000000000801',
  recipientName: 'Nguyen Van A',
  phoneNumber: '0912345678',
  province: 'TP. Ho Chi Minh',
  district: 'Quan 1',
  ward: 'Phuong Ben Nghe',
  addressLine: '12 Nguyen Hue',
  label: 'Nha rieng',
  isDefault: true,
  createdAt: '2026-08-12T01:00:00.000Z',
  updatedAt: '2026-08-12T01:00:00.000Z',
};

class AccountAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.headers.authorization !== 'Bearer buyer') throw new AuthenticationFailedError();
    request.authUser = user;
    return true;
  }
}

describe('Account endpoints', () => {
  let app: INestApplication;
  const account = {
    profile: jest.fn(),
    updateProfile: jest.fn(),
    addresses: jest.fn(),
    createAddress: jest.fn(),
    updateAddress: jest.fn(),
    deleteAddress: jest.fn(),
    selectDefault: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ onModuleInit: jest.fn(), onModuleDestroy: jest.fn() })
      .overrideProvider(AccountService)
      .useValue(account)
      .overrideGuard(AuthGuard)
      .useClass(AccountAuthGuard)
      .compile();
    app = moduleRef.createNestApplication();
    configureApplication(app, loadAuthConfig({ NODE_ENV: 'test', AUTH_ALLOWED_ORIGINS: origin }));
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    account.profile.mockResolvedValue(profile);
    account.updateProfile.mockResolvedValue(profile);
    account.addresses.mockResolvedValue({ items: [address] } satisfies ShippingAddressList);
    account.createAddress.mockResolvedValue(address);
    account.updateAddress.mockResolvedValue(address);
    account.deleteAddress.mockResolvedValue(undefined);
    account.selectDefault.mockResolvedValue(address);
  });

  afterAll(async () => app.close());

  it('requires bearer authentication and applies no-store to protected reads', async () => {
    await request(app.getHttpServer()).get('/api/v1/account/profile').expect(401);
    const result = await request(app.getHttpServer())
      .get('/api/v1/account/profile')
      .set('Authorization', 'Bearer buyer')
      .expect(200);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.body).toEqual(profile);
    expect(account.profile).toHaveBeenCalledWith(user.id);

    const addresses = await request(app.getHttpServer())
      .get('/api/v1/account/addresses')
      .set('Authorization', 'Bearer buyer')
      .expect(200);
    expect(addresses.body).toEqual({ items: [address] });
  });

  it('exposes the exact profile and address mutation routes and status codes', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/account/profile')
      .set('Authorization', 'Bearer buyer')
      .set('Origin', origin)
      .send({ displayName: 'Buyer Updated', phoneNumber: '+84 912 345 678' })
      .expect(200);
    expect(account.updateProfile).toHaveBeenCalledWith(user.id, {
      displayName: 'Buyer Updated',
      phoneNumber: '+84 912 345 678',
    });

    const payload = {
      recipientName: 'Nguyen Van A',
      phoneNumber: '0912345678',
      province: 'Ha Noi',
      district: 'Ba Dinh',
      ward: 'Phuc Xa',
      addressLine: '12 Hang Than',
      label: null,
      isDefault: true,
    };
    await request(app.getHttpServer())
      .post('/api/v1/account/addresses')
      .set('Authorization', 'Bearer buyer')
      .set('Origin', origin)
      .send(payload)
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/v1/account/addresses/${address.id}`)
      .set('Authorization', 'Bearer buyer')
      .set('Origin', origin)
      .send({ ward: 'Phuc Xa' })
      .expect(200);
    await request(app.getHttpServer())
      .put(`/api/v1/account/addresses/${address.id}/default`)
      .set('Authorization', 'Bearer buyer')
      .set('Origin', origin)
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/api/v1/account/addresses/${address.id}`)
      .set('Authorization', 'Bearer buyer')
      .set('Origin', origin)
      .expect(204);
  });

  it('rejects untrusted origins, unknown keys, and unavailable addresses with safe Problem Details', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/account/profile')
      .set('Authorization', 'Bearer buyer')
      .set('Origin', 'https://attacker.example')
      .send({ displayName: 'Buyer Updated' })
      .expect(403);

    const invalid = await request(app.getHttpServer())
      .post('/api/v1/account/addresses')
      .set('Authorization', 'Bearer buyer')
      .set('Origin', origin)
      .send({ secret: 'must-not-leak' })
      .expect(400);
    expect(invalid.headers['content-type']).toContain('application/problem+json');
    expect(JSON.stringify(invalid.body)).not.toContain('must-not-leak');

    account.updateAddress.mockRejectedValueOnce(new AccountAddressNotFoundError());
    const missing = await request(app.getHttpServer())
      .patch('/api/v1/account/addresses/not-a-uuid')
      .set('Authorization', 'Bearer buyer')
      .set('Origin', origin)
      .send({ ward: 'Private Ward' })
      .expect(404);
    expect(missing.body).toMatchObject({ status: 404, title: 'Address unavailable' });
    expect(JSON.stringify(missing.body)).not.toContain('Private Ward');
  });

  it('sanitizes unexpected dependency errors and complete contact payloads', async () => {
    account.createAddress.mockRejectedValueOnce(
      new Error('recipient=Private Person phone=0999999999 address=Secret Street'),
    );
    const response = await request(app.getHttpServer())
      .post('/api/v1/account/addresses')
      .set('Authorization', 'Bearer buyer')
      .set('Origin', origin)
      .send({
        recipientName: 'Private Person',
        phoneNumber: '0999999999',
        province: 'Ha Noi',
        district: 'Ba Dinh',
        ward: 'Phuc Xa',
        addressLine: 'Secret Street',
        label: 'Secret Label',
      })
      .expect(503);
    expect(JSON.stringify(response.body)).not.toMatch(/Private|0999999999|Secret/);
  });
});
