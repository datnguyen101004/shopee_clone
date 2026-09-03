import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import type { ModerationCaseDetail, ModerationDecisionResult } from '@shopee-clone/contracts';
import { AdminInvalidInputError } from './admin.errors';
import { AdminModerationRepository } from './admin-moderation.repository';
import { AdminModerationService } from './admin-moderation.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notifications/notification.service';

describe('AdminModerationService', () => {
  let service: AdminModerationService;
  let repository: jest.Mocked<AdminModerationRepository>;

  const validUuid = '123e4567-e89b-12d3-a456-426614174000';
  const adminId = '123e4567-e89b-12d3-a456-426614174001';
  const idempotencyKey = '123e4567-e89b-12d3-a456-426614174002';

  beforeEach(async () => {
    const mockRepo = {
      listCases: jest.fn(),
      getCaseDetail: jest.fn(),
      assignCase: jest.fn(),
      addNote: jest.fn(),
      makeDecision: jest.fn(),
    };
    const mockPrisma = { moderationCase: { findUnique: jest.fn() } };
    const mockNotifications = { notify: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminModerationService,
        { provide: AdminModerationRepository, useValue: mockRepo },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationService, useValue: mockNotifications },
      ],
    }).compile();

    service = module.get<AdminModerationService>(AdminModerationService);
    repository = module.get(AdminModerationRepository);
  });

  it('rejects operations when caseId or idempotencyKey is invalid', async () => {
    await expect(service.getCaseDetail('invalid-uuid')).rejects.toThrow(AdminInvalidInputError);

    await expect(
      service.assignCase(
        adminId,
        'invalid-uuid',
        { assignedAdminId: null, expectedVersion: 0 },
        idempotencyKey,
      ),
    ).rejects.toThrow(AdminInvalidInputError);

    await expect(
      service.assignCase(adminId, validUuid, { assignedAdminId: null, expectedVersion: 0 }, null),
    ).rejects.toThrow(AdminInvalidInputError);
  });

  it('validates public reason bounds on decision creation', async () => {
    await expect(
      service.makeDecision(
        adminId,
        validUuid,
        { outcome: 'SUSPEND_TARGET', publicReason: 'Short', expectedVersion: 0 },
        idempotencyKey,
      ),
    ).rejects.toThrow(AdminInvalidInputError);
  });

  it('requires a future expiry and private note for chat restrictions', async () => {
    await expect(
      service.makeDecision(
        adminId,
        validUuid,
        {
          outcome: 'RESTRICT_CHAT_TEMPORARY',
          publicReason: 'Temporary restriction for repeated abuse.',
          privateNote: 'Reviewed evidence',
          restrictionUntil: '2020-01-01T00:00:00.000Z',
          expectedVersion: 0,
        },
        idempotencyKey,
      ),
    ).rejects.toThrow(AdminInvalidInputError);

    await expect(
      service.makeDecision(
        adminId,
        validUuid,
        {
          outcome: 'RESTRICT_CHAT_INDEFINITE',
          publicReason: 'Indefinite restriction for severe abuse.',
          expectedVersion: 0,
        },
        idempotencyKey,
      ),
    ).rejects.toThrow(AdminInvalidInputError);
  });

  it('delegates assignCase, addNote, and makeDecision to repository with computed digests', async () => {
    repository.assignCase.mockResolvedValue({ caseDetail: {} as unknown as ModerationCaseDetail });
    repository.addNote.mockResolvedValue({ caseDetail: {} as unknown as ModerationCaseDetail });
    repository.makeDecision.mockResolvedValue({
      decisionId: validUuid,
    } as unknown as ModerationDecisionResult);

    await service.assignCase(
      adminId,
      validUuid,
      { assignedAdminId: adminId, expectedVersion: 0 },
      idempotencyKey,
    );
    expect(repository.assignCase).toHaveBeenCalledWith(
      adminId,
      validUuid,
      adminId,
      0,
      idempotencyKey,
      expect.any(String),
    );

    await service.addNote(
      adminId,
      validUuid,
      { note: 'Test note for moderation', expectedVersion: 1 },
      idempotencyKey,
    );
    expect(repository.addNote).toHaveBeenCalledWith(
      adminId,
      validUuid,
      'Test note for moderation',
      1,
      idempotencyKey,
      expect.any(String),
    );

    await service.makeDecision(
      adminId,
      validUuid,
      {
        outcome: 'SUSPEND_TARGET',
        publicReason: 'Suspension for verified counterfeits.',
        expectedVersion: 2,
      },
      idempotencyKey,
    );
    expect(repository.makeDecision).toHaveBeenCalledWith(
      adminId,
      validUuid,
      expect.objectContaining({
        outcome: 'SUSPEND_TARGET',
        publicReason: 'Suspension for verified counterfeits.',
        expectedVersion: 2,
      }),
      idempotencyKey,
      expect.any(String),
    );
  });
});
