import type { PrismaService } from '../prisma/prisma.service';
import { AuthRepository } from './auth.repository';

describe('AuthRepository cleanup', () => {
  it('bounds each opportunistic cleanup query and deletes only selected identifiers', async () => {
    const sessions = [{ id: '00000000-0000-4000-8000-000000000001' }];
    const resets = [{ id: '00000000-0000-4000-8000-000000000002' }];
    const googleAttempts = [{ id: '00000000-0000-4000-8000-000000000003' }];
    const prisma = {
      authSession: {
        findMany: jest.fn().mockResolvedValue(sessions),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      passwordResetToken: {
        findMany: jest.fn().mockResolvedValue(resets),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      googleLoginAttempt: {
        findMany: jest.fn().mockResolvedValue(googleAttempts),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    } as unknown as PrismaService;
    const repository = new AuthRepository(prisma);

    await repository.pruneExpired(new Date('2026-08-12T12:00:00.000Z'), 25);

    expect(prisma.authSession.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 25 }));
    expect(prisma.passwordResetToken.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 25 }),
    );
    expect(prisma.googleLoginAttempt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 25 }),
    );
    expect(prisma.authSession.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: sessions.map(({ id }) => id) } },
    });
    expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: resets.map(({ id }) => id) } },
    });
    expect(prisma.googleLoginAttempt.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: googleAttempts.map(({ id }) => id) } },
    });
  });
});
