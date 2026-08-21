import { createHash } from 'node:crypto';
import {
  isCanonicalUuid,
  isValidAdminReason,
  type AddModerationCaseNoteRequest,
  type AssignModerationCaseRequest,
  type CreateModerationDecisionRequest,
  type ModerationCaseDetail,
  type ModerationCaseListQuery,
  type ModerationCaseListResponse,
  type ModerationDecisionResult,
} from '@shopee-clone/contracts';
import { Inject, Injectable } from '@nestjs/common';
import type { ModerationCaseOutcome } from '../generated/prisma/enums';
import { AdminInvalidInputError } from './admin.errors';
import { AdminModerationRepository } from './admin-moderation.repository';

@Injectable()
export class AdminModerationService {
  constructor(
    @Inject(AdminModerationRepository)
    private readonly repository: AdminModerationRepository,
  ) {}

  async listCases(query: ModerationCaseListQuery): Promise<ModerationCaseListResponse> {
    return this.repository.listCases(query);
  }

  async getCaseDetail(caseId: string): Promise<ModerationCaseDetail> {
    if (!isCanonicalUuid(caseId)) {
      throw new AdminInvalidInputError('Invalid case identifier', { invalidParameters: ['caseId'] });
    }
    return this.repository.getCaseDetail(caseId);
  }

  async assignCase(
    actorAdminId: string,
    caseId: string,
    input: AssignModerationCaseRequest,
    idempotencyKey?: string | null,
  ): Promise<{ caseDetail: ModerationCaseDetail }> {
    if (!isCanonicalUuid(caseId)) {
      throw new AdminInvalidInputError('Invalid case identifier', { invalidParameters: ['caseId'] });
    }
    if (!idempotencyKey || !isCanonicalUuid(idempotencyKey)) {
      throw new AdminInvalidInputError('Valid UUID Idempotency-Key header is required', { invalidParameters: ['Idempotency-Key'] });
    }
    if (input.assignedAdminId && !isCanonicalUuid(input.assignedAdminId)) {
      throw new AdminInvalidInputError('Invalid assigned admin identifier', { invalidParameters: ['assignedAdminId'] });
    }

    const digest = createHash('sha256')
      .update(JSON.stringify({ actorAdminId, caseId, assignedAdminId: input.assignedAdminId, expectedVersion: input.expectedVersion }))
      .digest('hex');

    return this.repository.assignCase(
      actorAdminId,
      caseId,
      input.assignedAdminId,
      input.expectedVersion,
      idempotencyKey,
      digest,
    );
  }

  async addNote(
    actorAdminId: string,
    caseId: string,
    input: AddModerationCaseNoteRequest,
    idempotencyKey?: string | null,
  ): Promise<{ caseDetail: ModerationCaseDetail }> {
    if (!isCanonicalUuid(caseId)) {
      throw new AdminInvalidInputError('Invalid case identifier', { invalidParameters: ['caseId'] });
    }
    if (!idempotencyKey || !isCanonicalUuid(idempotencyKey)) {
      throw new AdminInvalidInputError('Valid UUID Idempotency-Key header is required', { invalidParameters: ['Idempotency-Key'] });
    }
    const trimmedNote = input.note?.trim();
    if (!trimmedNote || trimmedNote.length > 2000) {
      throw new AdminInvalidInputError('Note must be between 1 and 2000 characters', { invalidParameters: ['note'] });
    }

    const digest = createHash('sha256')
      .update(JSON.stringify({ actorAdminId, caseId, note: trimmedNote, expectedVersion: input.expectedVersion }))
      .digest('hex');

    return this.repository.addNote(
      actorAdminId,
      caseId,
      trimmedNote,
      input.expectedVersion,
      idempotencyKey,
      digest,
    );
  }

  async makeDecision(
    actorAdminId: string,
    caseId: string,
    input: CreateModerationDecisionRequest,
    idempotencyKey?: string | null,
  ): Promise<ModerationDecisionResult> {
    if (!isCanonicalUuid(caseId)) {
      throw new AdminInvalidInputError('Invalid case identifier', { invalidParameters: ['caseId'] });
    }
    if (!idempotencyKey || !isCanonicalUuid(idempotencyKey)) {
      throw new AdminInvalidInputError('Valid UUID Idempotency-Key header is required', { invalidParameters: ['Idempotency-Key'] });
    }
    const trimmedReason = input.publicReason?.trim();
    if (!isValidAdminReason(trimmedReason)) {
      throw new AdminInvalidInputError('Public reason must be between 8 and 240 characters', { invalidParameters: ['publicReason'] });
    }
    if (input.reversesDecisionId && !isCanonicalUuid(input.reversesDecisionId)) {
      throw new AdminInvalidInputError('Invalid reversesDecisionId identifier', { invalidParameters: ['reversesDecisionId'] });
    }

    const digest = createHash('sha256')
      .update(
        JSON.stringify({
          actorAdminId,
          caseId,
          outcome: input.outcome,
          publicReason: trimmedReason,
          privateNote: input.privateNote?.trim(),
          reversesDecisionId: input.reversesDecisionId,
          expectedVersion: input.expectedVersion,
        }),
      )
      .digest('hex');

    return this.repository.makeDecision(
      actorAdminId,
      caseId,
      {
        outcome: input.outcome as unknown as ModerationCaseOutcome,
        publicReason: trimmedReason,
        privateNote: input.privateNote?.trim() ?? undefined,
        reversesDecisionId: input.reversesDecisionId ?? undefined,
        expectedVersion: input.expectedVersion,
      },
      idempotencyKey,
      digest,
    );
  }
}
