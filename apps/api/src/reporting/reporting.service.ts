import { createHash } from 'node:crypto';
import {
  isCanonicalUuid,
  isValidProductReportReason,
  isValidReportDetails,
  isValidShopReportReason,
  type CreateReportRequest,
  type ReporterReportDetail,
  type ReporterReportListQuery,
  type ReporterReportListResponse,
} from '@shopee-clone/contracts';
import { Inject, Injectable } from '@nestjs/common';
import type { ReportReasonCode, ReportTargetType } from '../generated/prisma/enums';
import { ReportInvalidInputError } from './reporting.errors';
import {
  ReportingRepository,
  type CreateReportExecutionResult,
} from './reporting.repository';

@Injectable()
export class ReportingService {
  constructor(@Inject(ReportingRepository) private readonly repository: ReportingRepository) {}

  async submitReport(
    reporterUserId: string,
    input: CreateReportRequest,
    idempotencyKey?: string | null,
  ): Promise<CreateReportExecutionResult> {
    if (!idempotencyKey || !isCanonicalUuid(idempotencyKey)) {
      throw new ReportInvalidInputError('Valid UUID Idempotency-Key header is required', ['Idempotency-Key']);
    }

    const trimmedDetails = input.details?.trim();
    if (!isValidReportDetails(trimmedDetails)) {
      throw new ReportInvalidInputError('Report details must be between 20 and 1000 characters', ['details']);
    }

    if (input.targetType === 'PRODUCT' && !isValidProductReportReason(input.reasonCode)) {
      throw new ReportInvalidInputError(`Invalid reason code '${input.reasonCode}' for product report`, ['reasonCode']);
    }

    if (input.targetType === 'SHOP' && !isValidShopReportReason(input.reasonCode)) {
      throw new ReportInvalidInputError(`Invalid reason code '${input.reasonCode}' for shop report`, ['reasonCode']);
    }

    const normalizedEvidenceUrls = (input.evidenceUrls ?? [])
      .map((u) => u.trim())
      .filter((u) => u.length > 0);

    // Compute deterministic request digest
    const normalizedPayload = {
      reporterUserId,
      targetType: input.targetType,
      targetId: input.targetId,
      reasonCode: input.reasonCode,
      details: trimmedDetails,
      evidenceUrls: normalizedEvidenceUrls,
    };
    const requestDigest = createHash('sha256')
      .update(JSON.stringify(normalizedPayload))
      .digest('hex');

    return this.repository.submitReport({
      reporterUserId,
      targetType: input.targetType as unknown as ReportTargetType,
      targetId: input.targetId,
      reasonCode: input.reasonCode as unknown as ReportReasonCode,
      details: trimmedDetails,
      evidenceUrls: normalizedEvidenceUrls,
      idempotencyKey,
      requestDigest,
    });
  }

  async listReporterReports(
    reporterUserId: string,
    query: ReporterReportListQuery,
  ): Promise<ReporterReportListResponse> {
    return this.repository.listReporterReports(reporterUserId, query);
  }

  async getReporterReportDetail(
    reporterUserId: string,
    reportId: string,
  ): Promise<ReporterReportDetail> {
    if (!isCanonicalUuid(reportId)) {
      throw new ReportInvalidInputError('Invalid report identifier', ['reportId']);
    }
    return this.repository.getReporterReportDetail(reporterUserId, reportId);
  }
}
