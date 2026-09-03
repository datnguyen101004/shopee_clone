import { CatalogRepository } from './catalog.repository';

describe('CatalogRepository', () => {
  it('requests active candidates in stable newest-first order with eligible relations', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const repository = new CatalogRepository({ product: { findMany } } as never);
    await repository.findCandidates(['category-1']);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ categoryId: { in: ['category-1'] }, deletedAt: null }),
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        include: expect.objectContaining({
          variants: expect.any(Object),
          images: expect.any(Object),
        }),
      }),
    );
  });
});
