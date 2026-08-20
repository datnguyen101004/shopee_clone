import { isValidAdminReason } from '@shopee-clone/contracts';
import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import type { PrivilegedAction, PrivilegedTargetType } from '../generated/prisma/client';

export interface RecordPrivilegedAuditInput {
  actorUserId: string;
  targetType: PrivilegedTargetType;
  targetId: string;
  action: PrivilegedAction;
  reason: string;
  beforeSummary?: Record<string, unknown> | null;
  afterSummary?: Record<string, unknown> | null;
  now?: Date;
}

export async function recordPrivilegedAudit(
  prisma: Prisma.TransactionClient,
  input: RecordPrivilegedAuditInput,
): Promise<void> {
  const trimmedReason = input.reason?.trim();
  if (!isValidAdminReason(trimmedReason)) {
    throw new BadRequestException('Privileged audit reason must be between 8 and 240 characters');
  }

  // Ensure actor exists and targetId is valid
  if (!input.actorUserId || !input.targetId) {
    throw new BadRequestException('Privileged audit requires valid actor and target identifiers');
  }

  if (prisma?.privilegedAuditEvent?.create) {
    await prisma.privilegedAuditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        targetType: input.targetType,
        targetId: input.targetId,
        action: input.action,
        reason: trimmedReason,
        beforeSummary: (input.beforeSummary ?? undefined) as Prisma.InputJsonValue | undefined,
        afterSummary: (input.afterSummary ?? undefined) as Prisma.InputJsonValue | undefined,
        createdAt: input.now ?? new Date(),
      },
    });
  }
}

