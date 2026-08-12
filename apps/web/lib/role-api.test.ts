import { fetchRoleAuditPage, fetchSellerShop } from './role-api';

const fetcher = vi.fn();

describe('role API client', () => {
  beforeEach(() => fetcher.mockReset());

  it('loads a strict seller-shop projection through the authenticated fetcher', async () => {
    const shop = {
      id: '00000000-0000-4000-8000-000000000101',
      slug: 'seller-shop',
      name: 'Seller Shop',
      status: 'active',
    };
    fetcher.mockResolvedValue(new Response(JSON.stringify(shop), { status: 200 }));
    await expect(fetchSellerShop(fetcher)).resolves.toEqual(shop);
    expect(String(fetcher.mock.calls[0]![0])).toContain('/api/v1/seller/shop');
  });

  it('rejects owner assertions and malformed protected responses', async () => {
    fetcher.mockResolvedValue(
      new Response(
        JSON.stringify({
          id: '00000000-0000-4000-8000-000000000101',
          slug: 'seller-shop',
          name: 'Seller Shop',
          status: 'active',
          ownerId: '00000000-0000-4000-8000-000000000001',
        }),
        { status: 200 },
      ),
    );
    await expect(fetchSellerShop(fetcher)).rejects.toMatchObject({
      kind: 'contract',
    });
  });

  it('bounds audit requests and preserves authorization status failures', async () => {
    await expect(fetchRoleAuditPage(fetcher, 101)).rejects.toMatchObject({
      kind: 'contract',
    });
    fetcher.mockResolvedValue(new Response(null, { status: 403 }));
    await expect(fetchRoleAuditPage(fetcher, 20)).rejects.toMatchObject({
      kind: 'status',
      status: 403,
    });
  });
});
