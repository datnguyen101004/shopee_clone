import { AdminRepository } from './admin.repository';

describe('AdminRepository page pagination', () => {
  it('runs the count and page query with a fixed page size of 10', async () => {
    const count = jest.fn().mockResolvedValue(25);
    const findMany = jest.fn().mockResolvedValue([]);
    const repository = new AdminRepository({ user: { count, findMany } } as never);

    await expect(repository.listUsers({ page: 3, status: 'ACTIVE' })).resolves.toEqual({
      items: [],
      page: 3,
      pageSize: 10,
      totalItems: 25,
      totalPages: 3,
    });

    expect(count).toHaveBeenCalledWith({
      where: { deletedAt: null, status: 'ACTIVE' },
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 20,
        take: 10,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    );
  });

  it('uses 10 rows for page 3 of the shop list', async () => {
    const count = jest.fn().mockResolvedValue(21);
    const findMany = jest.fn().mockResolvedValue([]);
    const repository = new AdminRepository({ shop: { count, findMany } } as never);

    await expect(repository.listShops({ page: 3, status: 'ACTIVE' })).resolves.toEqual({
      items: [],
      page: 3,
      pageSize: 10,
      totalItems: 21,
      totalPages: 3,
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 20,
        take: 10,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      }),
    );
  });

  it('uses 10 rows and a narrow select for page 3 of the product list', async () => {
    const count = jest.fn().mockResolvedValue(21);
    const findMany = jest.fn().mockResolvedValue([]);
    const repository = new AdminRepository({ product: { count, findMany } } as never);

    await expect(repository.listProducts({ page: 3, status: 'ACTIVE' })).resolves.toEqual({
      items: [],
      page: 3,
      pageSize: 10,
      totalItems: 21,
      totalPages: 3,
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 20,
        take: 10,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        select: expect.objectContaining({ id: true, name: true, variants: expect.any(Object) }),
      }),
    );
  });
});
