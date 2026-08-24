import type { AuthUser, SellerProductDetail } from '@shopee-clone/contracts';
import type { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { loadAuthConfig } from '../src/auth/auth.config';
import { AuthenticationFailedError } from '../src/auth/auth.errors';
import { AuthGuard, type AuthenticatedRequest } from '../src/auth/auth.guard';
import { configureApplication } from '../src/configure-application';
import { PrismaService } from '../src/prisma/prisma.service';
import { SellerProductsService } from '../src/seller-products/seller-products.service';
import { SellerProductMediaStorage } from '../src/seller-products/seller-product-media.storage';

const seller: AuthUser = { id: '00000000-0000-4000-8000-000000000002', email: 'seller@example.test', displayName: 'Seller', status: 'active', roles: ['buyer', 'seller'] };
class TestAuthGuard implements CanActivate { canActivate(context: ExecutionContext) { const request = context.switchToHttp().getRequest<AuthenticatedRequest>(); if (request.headers.authorization !== 'Bearer seller') throw new AuthenticationFailedError(); request.authUser = seller; return true; } }
const product: SellerProductDetail = { id: '00000000-0000-4000-8000-000000000101', slug: 'test-product', name: 'Test product', description: 'Description', categoryId: '00000000-0000-4000-8000-000000000102', attributes: [], media: [{ id: '00000000-0000-4000-8000-000000000103', url: 'https://cdn.example.test/a.jpg', altText: null, sortOrder: 0, variantId: null }], packageLengthMm: 100, packageWidthMm: 100, packageHeightMm: 100, optionGroups: [], variants: [{ id: '00000000-0000-4000-8000-000000000104', combination: [], sku: 'TEST-001', priceMinor: 1000, compareAtPriceMinor: null, stock: 1, weightGrams: 500, maxPurchaseQuantity: null, active: true }], lifecycle: 'draft', moderationStatus: 'active', moderationReason: null, createdAt: '2026-08-17T00:00:00.000Z', updatedAt: '2026-08-17T00:00:00.000Z' };

describe('Seller product endpoints', () => {
  let app: INestApplication;
  const service = { categories: jest.fn(), list: jest.fn(), read: jest.fn(), create: jest.fn(), update: jest.fn(), transition: jest.fn(), deleteDraft: jest.fn(), stageMedia: jest.fn(), createMediaUploadIntent: jest.fn(), completeMediaUpload: jest.fn(), stagedMedia: jest.fn(), attachedMedia: jest.fn() };
  const mediaStorage = { write: jest.fn(), read: jest.fn(), readTarget: jest.fn(), remove: jest.fn() };
  beforeAll(async () => { const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue({ onModuleInit: jest.fn(), onModuleDestroy: jest.fn() }).overrideProvider(SellerProductsService).useValue(service).overrideProvider(SellerProductMediaStorage).useValue(mediaStorage).overrideGuard(AuthGuard).useClass(TestAuthGuard).compile(); app = module.createNestApplication(); configureApplication(app, loadAuthConfig({ NODE_ENV: 'test', AUTH_ALLOWED_ORIGINS: 'http://localhost:3000' })); await app.init(); });
  beforeEach(() => { jest.clearAllMocks(); service.categories.mockResolvedValue([]); service.list.mockResolvedValue({ items: [], nextCursor: null }); service.read.mockResolvedValue(product); service.create.mockResolvedValue(product); service.update.mockResolvedValue(product); service.transition.mockResolvedValue({ ...product, lifecycle: 'published' }); service.deleteDraft.mockResolvedValue(undefined); service.stageMedia.mockResolvedValue({ id: '00000000-0000-4000-8000-000000000105', mimeType: 'image/png', byteSize: 24, width: 1, height: 1, expiresAt: new Date('2026-08-18T00:00:00.000Z') }); service.createMediaUploadIntent.mockResolvedValue({ mediaId: '00000000-0000-4000-8000-000000000106', upload: { url: 'https://s3.example.test/signed', method: 'PUT', headers: { 'Content-Type': 'image/png', 'x-amz-checksum-sha256': 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=' }, expiresAt: '2026-08-24T10:05:00.000Z' } }); service.completeMediaUpload.mockResolvedValue({ id: '00000000-0000-4000-8000-000000000106', mimeType: 'image/png', byteSize: 24, width: 1, height: 1, previewUrl: '/api/v1/seller/products/media/00000000-0000-4000-8000-000000000106/preview', expiresAt: '2026-08-25T10:00:00.000Z' }); service.stagedMedia.mockResolvedValue(null); service.attachedMedia.mockResolvedValue(null); mediaStorage.write.mockResolvedValue('opaque.png'); mediaStorage.read.mockResolvedValue(Buffer.from('image')); mediaStorage.readTarget.mockResolvedValue(null); mediaStorage.remove.mockResolvedValue(undefined); });
  afterAll(async () => app.close());
  it('enforces seller authentication and exposes no-store seller product operations', async () => {
    await request(app.getHttpServer()).get('/api/v1/seller/products').expect(401);
    const list = await request(app.getHttpServer()).get('/api/v1/seller/products?lifecycle=draft').set('Authorization', 'Bearer seller').expect(200);
    expect(list.headers['cache-control']).toBe('no-store');
    expect(service.list).toHaveBeenCalledWith(seller.id, expect.objectContaining({ lifecycle: 'draft' }));
    await request(app.getHttpServer()).get('/api/v1/seller/products/categories').set('Authorization', 'Bearer seller').expect(200);
    const transition = await request(app.getHttpServer()).patch(`/api/v1/seller/products/${product.id}/lifecycle`).set('Authorization', 'Bearer seller').set('Origin', 'http://localhost:3000').send({ lifecycle: 'published' }).expect(200);
    expect(transition.body.lifecycle).toBe('published');
    expect(service.transition).toHaveBeenCalledWith(seller.id, product.id, { lifecycle: 'published' });
  });

  it('soft-deletes through the authenticated seller endpoint without deleting retained media', async () => {
    await request(app.getHttpServer()).delete(`/api/v1/seller/products/${product.id}`).set('Authorization', 'Bearer seller').set('Origin', 'http://localhost:3000').expect(204);
    expect(service.deleteDraft).toHaveBeenCalledWith(seller.id, product.id);
    expect(mediaStorage.remove).not.toHaveBeenCalled();
  });

  it('stages a seller product image through the guarded multipart route', async () => {
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1]);
    await request(app.getHttpServer()).post('/api/v1/seller/products/media').set('Authorization', 'Bearer seller').set('Origin', 'http://localhost:3000').attach('file', png, { filename: 'product.png', contentType: 'image/png' }).expect(201);
    expect(service.stageMedia).toHaveBeenCalledWith(seller.id, expect.objectContaining({ mimeType: 'image/png', width: 1, height: 1 }));
    expect(mediaStorage.write).toHaveBeenCalled();
    await request(app.getHttpServer()).post('/api/v1/seller/products/media').set('Origin', 'http://localhost:3000').attach('file', png, { filename: 'product.png', contentType: 'image/png' }).expect(401);
  });

  it('creates and completes a seller-owned direct upload intent without exposing storage metadata', async () => {
    const intent = await request(app.getHttpServer()).post('/api/v1/seller/products/media/upload-intents').set('Authorization', 'Bearer seller').set('Origin', 'http://localhost:3000').send({ mimeType: 'image/png', byteSize: 24, checksumSha256: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=' }).expect(201);
    expect(intent.body.upload.method).toBe('PUT');
    expect(intent.body.upload.expiresAt).toBe('2026-08-24T10:05:00.000Z');
    expect(JSON.stringify(intent.body)).not.toContain('bucket');
    expect(service.createMediaUploadIntent).toHaveBeenCalledWith(seller.id, expect.objectContaining({ mimeType: 'image/png', byteSize: 24 }));
    const completed = await request(app.getHttpServer()).post('/api/v1/seller/products/media/00000000-0000-4000-8000-000000000106/complete').set('Authorization', 'Bearer seller').set('Origin', 'http://localhost:3000').send({}).expect(200);
    expect(completed.body.previewUrl).toContain('/preview');
    expect(service.completeMediaUpload).toHaveBeenCalledWith(seller.id, '00000000-0000-4000-8000-000000000106');
  });

  it('rejects spoofed media and does not expose staged media publicly', async () => {
    await request(app.getHttpServer()).post('/api/v1/seller/products/media').set('Authorization', 'Bearer seller').set('Origin', 'http://localhost:3000').attach('file', Buffer.from('not-an-image'), { filename: 'product.png', contentType: 'image/png' }).expect(400);
    service.stagedMedia.mockResolvedValue(null);
    await request(app.getHttpServer()).get('/api/v1/seller/products/media/00000000-0000-4000-8000-000000000105/preview').set('Authorization', 'Bearer seller').expect(404);
    service.attachedMedia.mockResolvedValue(null);
    await request(app.getHttpServer()).get('/api/v1/product-media/00000000-0000-4000-8000-000000000105').expect(404);
  });

  it('redirects eligible managed media to the signed CDN without leaking a body', async () => {
    const signedUrl = 'https://cdn.videod.me/seller-product-media/opaque.png?Expires=1&Signature=secret&Key-Pair-Id=KTEST';
    service.attachedMedia.mockResolvedValue({ id: '00000000-0000-4000-8000-000000000105', storageKey: 'seller-product-media/opaque.png', mimeType: 'image/png' });
    mediaStorage.readTarget.mockResolvedValue({ kind: 'cloudfront', url: signedUrl, expiresAt: new Date(Date.now() + 300_000) });
    const response = await request(app.getHttpServer()).get('/api/v1/product-media/00000000-0000-4000-8000-000000000105').expect(307);
    expect(response.headers.location).toBe(signedUrl);
    expect(response.headers['cache-control']).toContain('private, no-store');
    expect(response.headers.pragma).toBe('no-cache');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.text).toBe('');
  });

  it('checks staged ownership before invoking the signed target and streams local bytes', async () => {
    service.stagedMedia.mockResolvedValue({ storageKey: 'opaque.png', mimeType: 'image/png' });
    mediaStorage.readTarget.mockResolvedValue({ kind: 'local', data: Buffer.from('image') });
    const response = await request(app.getHttpServer()).get('/api/v1/seller/products/media/00000000-0000-4000-8000-000000000105/preview').set('Authorization', 'Bearer seller').expect(200);
    expect(response.headers['content-type']).toMatch(/image\/png/);
    expect(response.headers['cache-control']).toContain('private, no-store');
    expect(mediaStorage.readTarget).toHaveBeenCalledWith('opaque.png');

    service.stagedMedia.mockResolvedValue(null);
    await request(app.getHttpServer()).get('/api/v1/seller/products/media/00000000-0000-4000-8000-000000000105/preview').set('Authorization', 'Bearer seller').expect(404);
    expect(mediaStorage.readTarget).toHaveBeenCalledTimes(1);
  });

  it('maps CDN signer failures to a safe problem response', async () => {
    service.attachedMedia.mockResolvedValue({ id: '00000000-0000-4000-8000-000000000105', storageKey: 'seller-product-media/opaque.png', mimeType: 'image/png' });
    mediaStorage.readTarget.mockRejectedValue(new Error('signed URL should not be exposed'));
    const response = await request(app.getHttpServer()).get('/api/v1/product-media/00000000-0000-4000-8000-000000000105').expect(503);
    expect(response.body.detail).not.toContain('signed URL');
    expect(JSON.stringify(response.body)).not.toContain('cdn.videod.me');
  });
});
