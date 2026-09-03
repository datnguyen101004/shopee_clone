import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import {
  ReportInvalidInputError,
} from './reporting.errors';
import { ReportingRepository } from './reporting.repository';
import { ReportingService } from './reporting.service';

describe('ReportingService', () => {
  let service: ReportingService;
  let repository: jest.Mocked<ReportingRepository>;

  const validUuid = '123e4567-e89b-12d3-a456-426614174000';
  const reporterId = '123e4567-e89b-12d3-a456-426614174001';
  const idempotencyKey = '123e4567-e89b-12d3-a456-426614174002';

  beforeEach(async () => {
    const mockRepo = {
      submitReport: jest.fn(),
      listReporterReports: jest.fn(),
      getReporterReportDetail: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportingService,
        { provide: ReportingRepository, useValue: mockRepo },
      ],
    }).compile();

    service = module.get<ReportingService>(ReportingService);
    repository = module.get(ReportingRepository);
  });

  it('rejects report submission when idempotency key is missing or invalid', async () => {
    await expect(
      service.submitReport(
        reporterId,
        {
          targetType: 'PRODUCT',
          targetId: validUuid,
          reasonCode: 'PROHIBITED_ITEM',
          details: 'Valid report details with more than 20 characters.',
        },
        null,
      ),
    ).rejects.toThrow(ReportInvalidInputError);

    await expect(
      service.submitReport(
        reporterId,
        {
          targetType: 'PRODUCT',
          targetId: validUuid,
          reasonCode: 'PROHIBITED_ITEM',
          details: 'Valid report details with more than 20 characters.',
        },
        'not-a-uuid',
      ),
    ).rejects.toThrow(ReportInvalidInputError);
  });

  it('rejects report submission when details are too short or too long', async () => {
    await expect(
      service.submitReport(
        reporterId,
        {
          targetType: 'PRODUCT',
          targetId: validUuid,
          reasonCode: 'PROHIBITED_ITEM',
          details: 'Too short',
        },
        idempotencyKey,
      ),
    ).rejects.toThrow(ReportInvalidInputError);
  });

  it('rejects product report with shop-only reason code', async () => {
    await expect(
      service.submitReport(
        reporterId,
        {
          targetType: 'PRODUCT',
          targetId: validUuid,
          reasonCode: 'FRAUD_SCAM',
          details: 'Valid report details with more than 20 characters.',
        },
        idempotencyKey,
      ),
    ).rejects.toThrow(ReportInvalidInputError);
  });

  it('rejects shop report with product-only reason code', async () => {
    await expect(
      service.submitReport(
        reporterId,
        {
          targetType: 'SHOP',
          targetId: validUuid,
          reasonCode: 'PROHIBITED_ITEM',
          details: 'Valid report details with more than 20 characters.',
        },
        idempotencyKey,
      ),
    ).rejects.toThrow(ReportInvalidInputError);
  });

  it('successfully computes digest and forwards to repository', async () => {
    const mockResult = {
      isReplay: false,
      response: {
        reportId: validUuid,
        targetType: 'PRODUCT' as const,
        targetId: validUuid,
        reasonCode: 'PROHIBITED_ITEM' as const,
        status: 'SUBMITTED' as const,
        createdAt: new Date().toISOString(),
      },
    };
    repository.submitReport.mockResolvedValue(mockResult);

    const result = await service.submitReport(
      reporterId,
      {
        targetType: 'PRODUCT',
        targetId: validUuid,
        reasonCode: 'PROHIBITED_ITEM',
        details: 'Valid report details with more than 20 characters.',
        evidenceUrls: ['https://example.com/proof.jpg'],
      },
      idempotencyKey,
    );

    expect(result).toEqual(mockResult);
    expect(repository.submitReport).toHaveBeenCalledWith(
      expect.objectContaining({
        reporterUserId: reporterId,
        targetType: 'PRODUCT',
        targetId: validUuid,
        reasonCode: 'PROHIBITED_ITEM',
        idempotencyKey,
        requestDigest: expect.any(String),
      }),
    );
  });

  it('lists reporter reports and gets report detail with validation', async () => {
    const mockList = { items: [], nextCursor: null };
    repository.listReporterReports.mockResolvedValue(mockList);

    const list = await service.listReporterReports(reporterId, { limit: 10 });
    expect(list).toEqual(mockList);

    await expect(service.getReporterReportDetail(reporterId, 'invalid-id')).rejects.toThrow(
      ReportInvalidInputError,
    );
  });
});
