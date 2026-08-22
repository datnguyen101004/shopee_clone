import { createHash, randomUUID } from 'node:crypto';

import type {
  AdminReturnDecisionRequest,
  BuyerReturnActionRequest,
  CreateReturnRequest,
  ReturnDetailResponse,
  ReturnListQuery,
  ReturnListResponse,
  SellerReturnActionRequest,
  StagedReturnEvidence,
} from '@shopee-clone/contracts';
import { Inject, Injectable } from '@nestjs/common';

import { Prisma } from '../generated/prisma/client';
import type {
  Prisma as PrismaTypes,
  ReturnActorType,
  ReturnStatus,
} from '../generated/prisma/client';
import { OrderLifecycleService } from '../order-history/order-lifecycle.service';
import { PrismaService } from '../prisma/prisma.service';
import { recordPrivilegedAudit } from '../admin/privileged-audit.helper';
import { allocateReturnLines, returnAllocationTotal } from './return-calculation';
import { returnCreateDigest, returnDigestsEqual, returnMutationDigest } from './return-canonical';
import { SystemReturnClock, type ReturnClock } from './return-clock';
import { decodeReturnCursor, encodeReturnCursor } from './return-cursor';
import {
  ReturnActionConflictError,
  ReturnDeadlineConflictError,
  ReturnEligibilityConflictError,
  ReturnIdempotencyConflictError,
  ReturnNotFoundError,
  ReturnStaleError,
  ReturnUnavailableError,
} from './return-errors';
import {
  initialReturnDeadlines,
  isPastDeadline,
  receiptDeadline,
  shipmentDeadline,
} from './return-policy';
import { ReturnProjector } from './return-projector';
import { ReturnRepository, type ReturnRequestGraph } from './return-repository';
import { transitionFor, type ReturnDomainAction } from './return-state-machine';
import { returnNotificationEvent } from '../notifications/notification-events';
import { NotificationService } from '../notifications/notification.service';
import type { NotificationType } from '@shopee-clone/contracts';

type Viewer = 'BUYER' | 'SELLER' | 'ADMIN';

function snapshotText(value: Prisma.JsonValue, key: string, fallback = ''): string {
  return value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>)[key] === 'string'
    ? ((value as Record<string, unknown>)[key] as string)
    : fallback;
}

function systemKey(reference: string, version: number, action: string): string {
  const hex = createHash('sha256').update(`${reference}:${version}:${action}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

@Injectable()
export class ReturnService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ReturnRepository) private readonly repository: ReturnRepository,
    @Inject(ReturnProjector) private readonly projector: ReturnProjector,
    @Inject(OrderLifecycleService) private readonly lifecycle: OrderLifecycleService,
    @Inject(SystemReturnClock) private readonly clock: ReturnClock,
    @Inject(NotificationService) private readonly notifications: NotificationService,
  ) {}

  async list(
    viewer: Viewer,
    userId: string | null,
    query: ReturnListQuery,
  ): Promise<ReturnListResponse> {
    const cursor = query.cursor ? decodeReturnCursor(query.cursor, query) : null;
    if (query.cursor && !cursor) throw new ReturnUnavailableError();
    const now = this.clock.now();
    const rows =
      viewer === 'BUYER'
        ? await this.repository.listBuyer(userId!, query, cursor, now)
        : viewer === 'SELLER'
          ? await this.repository.listSeller(userId!, query, cursor, now)
          : await this.repository.listAdmin(query, cursor, now);
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return this.projector.list(
      page,
      viewer,
      query.limit,
      rows.length > query.limit && last
        ? encodeReturnCursor(query, { updatedAt: last.updatedAt, id: last.id })
        : null,
    );
  }

  async stageEvidence(
    userId: string,
    upload: {
      storageKey: string;
      mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
      bytes: number;
      width: number;
      height: number;
    },
  ): Promise<StagedReturnEvidence> {
    const expiresAt = new Date(this.clock.now().getTime() + 24 * 60 * 60 * 1_000);
    const asset = await this.prisma.returnEvidenceAsset.create({
      data: {
        uploaderId: userId,
        storageKey: upload.storageKey,
        mimeType: upload.mimeType,
        byteSize: upload.bytes,
        width: upload.width,
        height: upload.height,
        expiresAt,
      },
    });
    return { evidenceId: asset.id, expiresAt: expiresAt.toISOString() };
  }

  async readableEvidence(userId: string, evidenceId: string, isAdmin: boolean) {
    return this.prisma.returnEvidenceAsset.findFirst({
      where: {
        id: evidenceId,
        state: 'ATTACHED',
        OR: [
          { uploaderId: userId },
          {
            returnRequest: {
              shop: {
                ownerId: userId,
                deletedAt: null,
                status: 'ACTIVE',
                onboardingStatus: 'APPROVED',
              },
            },
          },
          ...(isAdmin ? [{}] : []),
        ],
      },
      select: { storageKey: true, mimeType: true },
    });
  }

  async cleanupExpiredEvidence(
    storage: { remove(key: string): Promise<void> },
    limit = 100,
  ): Promise<number> {
    const expired = await this.prisma.returnEvidenceAsset.findMany({
      where: { state: 'STAGED', expiresAt: { lt: this.clock.now() } },
      select: { id: true, storageKey: true },
      orderBy: { expiresAt: 'asc' },
      take: limit,
    });
    for (const asset of expired) await storage.remove(asset.storageKey);
    if (expired.length) {
      await this.prisma.returnEvidenceAsset.deleteMany({
        where: { id: { in: expired.map((asset) => asset.id) }, state: 'STAGED' },
      });
    }
    return expired.length;
  }

  async detailBuyer(userId: string, reference: string): Promise<ReturnDetailResponse> {
    const graph = await this.repository.detailBuyer(userId, reference);
    if (!graph) throw new ReturnNotFoundError();
    return this.projector.detail(graph, 'BUYER');
  }

  async detailSeller(userId: string, reference: string): Promise<ReturnDetailResponse> {
    const graph = await this.repository.detailSeller(userId, reference);
    if (!graph) throw new ReturnNotFoundError();
    return this.projector.detail(graph, 'SELLER');
  }

  async detailAdmin(reference: string) {
    const graph = await this.repository.detailAdmin(reference);
    if (!graph) throw new ReturnNotFoundError();
    return this.projector.adminDetail(graph);
  }

  async createBuyer(
    userId: string,
    orderReference: string,
    expectedOrderVersion: number,
    idempotencyKey: string,
    input: CreateReturnRequest,
  ): Promise<ReturnDetailResponse> {
    const requestDigest = returnCreateDigest(orderReference, expectedOrderVersion, input);
    try {
      const created = await this.prisma.$transaction(
        async (tx) => {
          await this.repository.lockBuyerOrder(tx, userId, orderReference);
          const replay = await tx.returnRequest.findFirst({
            where: { buyerId: userId, idempotencyKey },
          });
          if (replay) {
            if (!returnDigestsEqual(replay.requestDigest, requestDigest))
              throw new ReturnIdempotencyConflictError();
            const graph = await this.repository.detailBuyer(userId, replay.id, tx);
            if (!graph) throw new ReturnNotFoundError();
            return {
              detail: this.projector.detail(graph, 'BUYER'),
              returnId: replay.id,
              notifyType: 'RETURN_REQUESTED' as const,
              replay: true as const,
            };
          }
          const order = await tx.shopOrder.findFirst({
            where: { id: orderReference, purchase: { buyerId: userId } },
            include: {
              lines: true,
              timelineEvents: { orderBy: [{ orderVersion: 'asc' }, { id: 'asc' }] },
            },
          });
          if (!order) throw new ReturnNotFoundError();
          if (order.version !== expectedOrderVersion) throw new ReturnStaleError(order.version);
          if (order.status !== 'DELIVERED') throw new ReturnActionConflictError(order.version);
          const delivery = [...order.timelineEvents]
            .reverse()
            .find((event) => event.status === 'DELIVERED');
          if (!delivery) throw new ReturnActionConflictError(order.version);
          const now = this.clock.now();
          const deadlines = initialReturnDeadlines(delivery.occurredAt, now);
          if (isPastDeadline(now, deadlines.eligibilityAt))
            throw new ReturnEligibilityConflictError(order.version);
          const selections = input.items.map((requested) => {
            const line = order.lines.find(
              (candidate) => candidate.sourceCartLineId === requested.lineReference,
            );
            if (!line) throw new ReturnActionConflictError(order.version);
            return {
              lineReference: requested.lineReference,
              purchasedQuantity: line.quantity,
              requestedQuantity: requested.quantity,
              payableMerchandiseMinor: line.payableMerchandiseMinor,
              orderLineId: line.id,
            };
          });
          const allocations = allocateReturnLines(selections);
          await this.repository.lockEvidence(tx, input.evidenceIds);
          const evidence = await tx.returnEvidenceAsset.findMany({
            where: {
              id: { in: input.evidenceIds },
              uploaderId: userId,
              state: 'STAGED',
              expiresAt: { gte: now },
            },
            select: { id: true },
          });
          if (evidence.length !== input.evidenceIds.length)
            throw new ReturnActionConflictError(order.version);
          const request = await tx.returnRequest.create({
            data: {
              orderId: order.id,
              buyerId: userId,
              shopId: order.shopId,
              reasonCode: input.reasonCode,
              description: input.description,
              policyVersion: 'returns-v1',
              eligibilityDeadlineAt: deadlines.eligibilityAt,
              sellerResponseDeadlineAt: deadlines.sellerResponseAt,
              refundAmountMinor: returnAllocationTotal(allocations),
              idempotencyKey,
              requestDigest,
              createdAt: now,
              updatedAt: now,
              items: {
                create: allocations.map((allocation) => ({
                  orderLineId: selections.find(
                    (selection) => selection.lineReference === allocation.lineReference,
                  )!.orderLineId,
                  requestedQuantity: allocation.requestedQuantity,
                  purchasedQuantity: allocation.purchasedQuantity,
                  payableMinor: allocation.payableMerchandiseMinor,
                  refundMinor: allocation.refundMinor,
                })),
              },
              events: {
                create: {
                  previousStatus: null,
                  status: 'REQUESTED',
                  version: 0,
                  actorType: 'BUYER',
                  actorUserId: userId,
                  action: 'CREATE',
                  reasonCode: 'RETURN_CREATE',
                  idempotencyKey,
                  requestDigest,
                  occurredAt: now,
                },
              },
            },
          });
          for (const [sortOrder, evidenceId] of input.evidenceIds.entries()) {
            const attached = await tx.returnEvidenceAsset.updateMany({
              where: {
                id: evidenceId,
                uploaderId: userId,
                state: 'STAGED',
                expiresAt: { gte: now },
              },
              data: { returnRequestId: request.id, state: 'ATTACHED', expiresAt: null, sortOrder },
            });
            if (attached.count !== 1) throw new ReturnActionConflictError(order.version);
          }
          await this.lifecycle.transition(tx, {
            orderId: order.id,
            currentStatus: 'DELIVERED',
            targetStatus: 'RETURN_REQUESTED',
            expectedVersion: order.version,
            actorType: 'BUYER',
            actorUserId: userId,
            reasonCode: 'RETURN_REQUEST_CREATED',
            reasonNote: null,
            idempotencyKey,
            requestDigest,
          });
          const graph = await this.repository.detailBuyer(userId, request.id, tx);
          if (!graph) throw new ReturnNotFoundError();
          return {
            detail: this.projector.detail(graph, 'BUYER'),
            returnId: request.id,
            notifyType: 'RETURN_REQUESTED' as const,
            replay: false as const,
          };
        },
        { isolationLevel: 'ReadCommitted', maxWait: 5_000, timeout: 15_000 },
      );
      if (!created.replay) await this.emitReturnNotification(created.returnId, created.notifyType);
      return created.detail;
    } catch (error) {
      if (
        error instanceof ReturnNotFoundError ||
        error instanceof ReturnStaleError ||
        error instanceof ReturnActionConflictError ||
        error instanceof ReturnEligibilityConflictError ||
        error instanceof ReturnIdempotencyConflictError
      )
        throw error;
      throw new ReturnUnavailableError();
    }
  }

  async actBuyer(
    userId: string,
    reference: string,
    expectedVersion: number,
    idempotencyKey: string,
    input: BuyerReturnActionRequest,
  ): Promise<ReturnDetailResponse> {
    return this.mutate(
      userId,
      reference,
      expectedVersion,
      idempotencyKey,
      input,
      'BUYER',
    ) as Promise<ReturnDetailResponse>;
  }

  async actSeller(
    userId: string,
    reference: string,
    expectedVersion: number,
    idempotencyKey: string,
    input: SellerReturnActionRequest,
  ): Promise<ReturnDetailResponse> {
    return this.mutate(
      userId,
      reference,
      expectedVersion,
      idempotencyKey,
      input,
      'SELLER',
    ) as Promise<ReturnDetailResponse>;
  }

  async decideAdmin(
    userId: string,
    reference: string,
    expectedVersion: number,
    idempotencyKey: string,
    input: AdminReturnDecisionRequest,
  ) {
    return this.mutate(userId, reference, expectedVersion, idempotencyKey, input, 'ADMIN');
  }

  private async mutate(
    userId: string,
    reference: string,
    expectedVersion: number,
    idempotencyKey: string,
    input: BuyerReturnActionRequest | SellerReturnActionRequest | AdminReturnDecisionRequest,
    viewer: Viewer,
  ): Promise<ReturnDetailResponse | ReturnType<ReturnProjector['adminDetail']>> {
    const requestDigest = returnMutationDigest(reference, expectedVersion, input);
    try {
      const mutated = await this.prisma.$transaction(
        async (tx) => {
          let graph = await this.graphFor(viewer, userId, reference, tx);
          if (!graph) throw new ReturnNotFoundError();
          await this.repository.lockOrder(tx, graph.orderId);
          await this.repository.lockReturn(tx, reference);
          graph = await this.graphFor(viewer, userId, reference, tx);
          if (!graph) throw new ReturnNotFoundError();
          const replay = await tx.returnEvent.findFirst({
            where: { returnRequestId: graph.id, idempotencyKey },
          });
          if (replay) {
            if (!returnDigestsEqual(replay.requestDigest, requestDigest))
              throw new ReturnIdempotencyConflictError();
            return {
              detail:
                viewer === 'ADMIN'
                  ? this.projector.adminDetail(graph)
                  : this.projector.detail(graph, viewer),
              returnId: graph.id,
              notifyType: null as Extract<
                NotificationType,
                'RETURN_REQUESTED' | 'RETURN_ACCEPTED' | 'DISPUTE_ESCALATED' | 'REFUNDED'
              > | null,
              replay: true as const,
            };
          }
          if (graph.version !== expectedVersion) throw new ReturnStaleError(graph.version);
          const now = this.clock.now();
          const action =
            viewer === 'ADMIN'
              ? (input as AdminReturnDecisionRequest).decision
              : (input as BuyerReturnActionRequest | SellerReturnActionRequest).action;
          const target = transitionFor(graph.status, viewer, action as ReturnDomainAction);
          if (!target) throw new ReturnActionConflictError(graph.version);
          this.ensureActionDeadline(graph, action, now);
          if (viewer === 'ADMIN' && action === 'APPROVE_RETURN' && graph.shipment)
            throw new ReturnActionConflictError(graph.version);
          const publicReason =
            viewer === 'BUYER'
              ? null
              : viewer === 'ADMIN'
                ? (input as AdminReturnDecisionRequest).publicReason
                : ((input as SellerReturnActionRequest).publicReason ?? null);
          const event = await this.advance(
            tx,
            graph,
            viewer,
            action as ReturnDomainAction,
            target,
            userId,
            idempotencyKey,
            requestDigest,
            publicReason,
            now,
          );
          if (action === 'SUBMIT_SHIPMENT') {
            const snapshot = snapshotText(graph.order.shopSnapshot, 'name', graph.shop.name);
            await tx.returnShipment.create({
              data: {
                returnRequestId: graph.id,
                trackingCode: `MOCK-${createHash('sha256').update(`${graph.id}:${idempotencyKey}`).digest('hex').slice(0, 16).toUpperCase()}`,
                destination: {
                  shopName: snapshot,
                  address: snapshotText(graph.order.shopSnapshot, 'returnAddress'),
                },
                submittedAt: now,
              },
            });
          }
          if (action === 'CANCEL' || action === 'REJECT') {
            await this.reverseOrder(
              tx,
              graph,
              viewer,
              userId,
              idempotencyKey,
              requestDigest,
              action,
            );
          }
          if (action === 'CONFIRM_RECEIPT')
            await this.finalizeRefund(
              tx,
              graph,
              viewer,
              userId,
              publicReason ?? 'Seller confirmed receipt',
              true,
            );
          if (action === 'APPROVE_REFUND')
            await this.finalizeRefund(
              tx,
              graph,
              viewer,
              userId,
              publicReason ?? 'Admin approved refund',
              false,
            );
          if (viewer === 'ADMIN') {
            const decision = await tx.returnDecision.create({
              data: {
                returnRequestId: graph.id,
                eventId: event.id,
                actorUserId: userId,
                decision: action as 'APPROVE_RETURN' | 'APPROVE_REFUND' | 'REJECT',
                publicReason: publicReason!,
                internalNote: (input as AdminReturnDecisionRequest).internalNote ?? null,
                correlationId: randomUUID(),
                decidedAt: now,
              },
            });
            await recordPrivilegedAudit(tx, {
              actorUserId: userId,
              targetType: 'RETURN_REQUEST',
              targetId: graph.id,
              action:
                action === 'APPROVE_RETURN'
                  ? 'APPROVE_RETURN'
                  : action === 'APPROVE_REFUND'
                    ? 'APPROVE_REFUND'
                    : 'REJECT',
              reason: publicReason!,
              beforeSummary: { status: graph.status, amountMinor: Number(graph.refundAmountMinor) },
              afterSummary: { status: target, amountMinor: Number(graph.refundAmountMinor) },
              returnDecisionId: decision.id,
              now,
            });
          }
          const current = await this.graphFor(viewer, userId, reference, tx);
          if (!current) throw new ReturnNotFoundError();
          const notifyType =
            target === 'AWAITING_RETURN'
              ? ('RETURN_ACCEPTED' as const)
              : target === 'ESCALATED'
                ? ('DISPUTE_ESCALATED' as const)
                : target === 'REFUNDED'
                  ? ('REFUNDED' as const)
                  : null;
          return {
            detail:
              viewer === 'ADMIN'
                ? this.projector.adminDetail(current)
                : this.projector.detail(current, viewer),
            returnId: current.id,
            notifyType,
            replay: false as const,
          };
        },
        { isolationLevel: 'ReadCommitted', maxWait: 5_000, timeout: 15_000 },
      );
      if (!mutated.replay && mutated.notifyType) {
        await this.emitReturnNotification(mutated.returnId, mutated.notifyType);
      }
      return mutated.detail;
    } catch (error) {
      if (
        error instanceof ReturnNotFoundError ||
        error instanceof ReturnStaleError ||
        error instanceof ReturnActionConflictError ||
        error instanceof ReturnDeadlineConflictError ||
        error instanceof ReturnIdempotencyConflictError
      )
        throw error;
      throw new ReturnUnavailableError();
    }
  }

  private async emitReturnNotification(
    returnId: string,
    type: Extract<
      NotificationType,
      'RETURN_REQUESTED' | 'RETURN_ACCEPTED' | 'DISPUTE_ESCALATED' | 'REFUNDED'
    >,
  ): Promise<void> {
    try {
      const row = await this.prisma.returnRequest.findUnique({
        where: { id: returnId },
        select: {
          id: true,
          orderId: true,
          buyerId: true,
          refundAmountMinor: true,
          currency: true,
          shop: { select: { ownerId: true } },
          items: {
            take: 1,
            select: { orderLine: { select: { productImageUrl: true } } },
          },
        },
      });
      if (!row) return;
      const adminUserIds =
        type === 'DISPUTE_ESCALATED'
          ? (
              await this.prisma.userRoleAssignment.findMany({
                where: { role: 'ADMIN' },
                select: { userId: true },
              })
            ).map((assignment) => assignment.userId)
          : [];
      await this.notifications.notify(
        returnNotificationEvent({
          type,
          returnId: row.id,
          orderId: row.orderId,
          buyerId: row.buyerId,
          sellerOwnerId: row.shop.ownerId,
          adminUserIds,
          amountMinor: Number(row.refundAmountMinor),
          currency: row.currency,
          thumbnailUrl: row.items[0]?.orderLine.productImageUrl ?? null,
        }),
      );
    } catch (error) {
      console.error('[notifications] return emit failed', error);
    }
  }

  private async graphFor(
    viewer: Viewer,
    userId: string,
    reference: string,
    tx: PrismaTypes.TransactionClient,
  ): Promise<ReturnRequestGraph | null> {
    return viewer === 'BUYER'
      ? this.repository.detailBuyer(userId, reference, tx)
      : viewer === 'SELLER'
        ? this.repository.detailSeller(userId, reference, tx)
        : this.repository.detailAdmin(reference, tx);
  }

  private ensureActionDeadline(graph: ReturnRequestGraph, action: string, now: Date): void {
    const deadline =
      action === 'ACCEPT_RETURN' ||
      action === 'REJECT_AND_ESCALATE' ||
      (action === 'ESCALATE' && graph.status === 'REQUESTED')
        ? graph.sellerResponseDeadlineAt
        : action === 'SUBMIT_SHIPMENT'
          ? graph.shipmentDeadlineAt
          : action === 'CONFIRM_RECEIPT' || (action === 'ESCALATE' && graph.status === 'IN_TRANSIT')
            ? graph.receiptDeadlineAt
            : null;
    if (deadline && isPastDeadline(now, deadline))
      throw new ReturnDeadlineConflictError(graph.version);
  }

  private async advance(
    tx: PrismaTypes.TransactionClient,
    graph: ReturnRequestGraph,
    actor: ReturnActorType,
    action: ReturnDomainAction,
    target: ReturnStatus,
    actorUserId: string,
    idempotencyKey: string,
    requestDigest: string,
    publicReason: string | null,
    now: Date,
  ) {
    const data: PrismaTypes.ReturnRequestUpdateManyMutationInput = {
      status: target,
      version: { increment: 1 },
      updatedAt: now,
    };
    if (target === 'AWAITING_RETURN') {
      data.shipmentDeadlineAt = shipmentDeadline(now);
      data.sellerResponseDeadlineAt = null;
    }
    if (target === 'IN_TRANSIT') {
      data.receiptDeadlineAt = receiptDeadline(now);
      data.shipmentDeadlineAt = null;
    }
    if (target !== 'REQUESTED') data.sellerResponseDeadlineAt = null;
    const updated = await tx.returnRequest.updateMany({
      where: { id: graph.id, status: graph.status, version: graph.version },
      data,
    });
    if (updated.count !== 1) throw new ReturnStaleError(graph.version);
    return tx.returnEvent.create({
      data: {
        returnRequestId: graph.id,
        previousStatus: graph.status,
        status: target,
        version: graph.version + 1,
        actorType: actor,
        actorUserId: actor === 'SYSTEM' ? null : actorUserId,
        action:
          action === 'SELLER_RESPONSE_DEADLINE'
            ? 'ESCALATE_DEADLINE'
            : action === 'SHIPMENT_DEADLINE'
              ? 'EXPIRE_SHIPMENT'
              : action === 'RECEIPT_DEADLINE'
                ? 'ESCALATE_DEADLINE'
                : action,
        reasonCode: `RETURN_${action}`,
        publicReason,
        idempotencyKey,
        requestDigest,
        occurredAt: now,
      },
    });
  }

  private async reverseOrder(
    tx: PrismaTypes.TransactionClient,
    graph: ReturnRequestGraph,
    actor: ReturnActorType,
    actorUserId: string,
    idempotencyKey: string,
    requestDigest: string,
    action: string,
  ): Promise<void> {
    await this.lifecycle.transition(tx, {
      orderId: graph.orderId,
      currentStatus: graph.order.status,
      targetStatus: 'DELIVERED',
      expectedVersion: graph.order.version,
      actorType: actor === 'SYSTEM' ? 'SYSTEM' : actor,
      actorUserId: actor === 'SYSTEM' ? null : actorUserId,
      reasonCode: `RETURN_${action}`,
      reasonNote: null,
      idempotencyKey,
      requestDigest,
    });
  }

  private async finalizeRefund(
    tx: PrismaTypes.TransactionClient,
    graph: ReturnRequestGraph,
    actor: ReturnActorType,
    actorUserId: string,
    publicReason: string,
    received: boolean,
  ): Promise<void> {
    const total = returnAllocationTotal(
      graph.items.map((item) => ({ refundMinor: item.refundMinor })),
    );
    if (
      total !== graph.refundAmountMinor ||
      graph.items.some((item) => item.refundMinor > item.payableMinor)
    )
      throw new ReturnUnavailableError();
    let version = graph.order.version;
    let status = graph.order.status;
    if (received) {
      await this.lifecycle.transition(tx, {
        orderId: graph.orderId,
        currentStatus: status,
        targetStatus: 'RETURNED',
        expectedVersion: version,
        actorType: actor,
        actorUserId,
        reasonCode: 'RETURN_RECEIVED',
        reasonNote: null,
      });
      version += 1;
      status = 'RETURNED';
    }
    await this.lifecycle.transition(tx, {
      orderId: graph.orderId,
      currentStatus: status,
      targetStatus: 'REFUNDED',
      expectedVersion: version,
      actorType: actor,
      actorUserId,
      reasonCode: 'RETURN_REFUNDED',
      reasonNote: null,
    });
    await tx.refundLedgerEntry.create({
      data: {
        returnRequestId: graph.id,
        orderId: graph.orderId,
        buyerId: graph.buyerId,
        shopId: graph.shopId,
        kind: 'MOCK_CREDIT',
        currency: 'VND',
        amountMinor: total,
        allocations: graph.items.map((item) => ({
          lineReference: item.orderLine.sourceCartLineId,
          amountMinor: item.refundMinor.toString(),
        })),
        actorType: actor,
        actorUserId: actor === 'SYSTEM' ? null : actorUserId,
        publicReason,
      },
    });
  }

  async processDeadlines(limit = 25): Promise<number> {
    const now = this.clock.now();
    const candidates = await this.prisma.returnRequest.findMany({
      where: {
        OR: [
          { status: 'REQUESTED', sellerResponseDeadlineAt: { lt: now } },
          { status: 'AWAITING_RETURN', shipmentDeadlineAt: { lt: now } },
          { status: 'IN_TRANSIT', receiptDeadlineAt: { lt: now } },
        ],
      },
      select: { id: true },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: limit,
    });
    let processed = 0;
    for (const candidate of candidates) {
      const applied = await this.prisma.$transaction(async (tx) => {
        const graph = await this.repository.detailAdmin(candidate.id, tx);
        if (!graph) return false;
        await this.repository.lockOrder(tx, graph.orderId);
        await this.repository.lockReturn(tx, graph.id);
        const current = await this.repository.detailAdmin(graph.id, tx);
        if (!current) return false;
        const action: ReturnDomainAction =
          current.status === 'REQUESTED'
            ? 'SELLER_RESPONSE_DEADLINE'
            : current.status === 'AWAITING_RETURN'
              ? 'SHIPMENT_DEADLINE'
              : current.status === 'IN_TRANSIT'
                ? 'RECEIPT_DEADLINE'
                : 'SELLER_RESPONSE_DEADLINE';
        const target = transitionFor(current.status, 'SYSTEM', action);
        if (!target) return false;
        const deadline =
          current.status === 'REQUESTED'
            ? current.sellerResponseDeadlineAt
            : current.status === 'AWAITING_RETURN'
              ? current.shipmentDeadlineAt
              : current.receiptDeadlineAt;
        if (!deadline || !isPastDeadline(now, deadline)) return false;
        const key = systemKey(current.id, current.version, action);
        const digest = returnMutationDigest(current.id, current.version, { action: 'CANCEL' });
        await this.advance(
          tx,
          current,
          'SYSTEM',
          action,
          target,
          '00000000-0000-4000-8000-000000000000',
          key,
          digest,
          null,
          now,
        );
        if (target === 'EXPIRED')
          await this.reverseOrder(
            tx,
            current,
            'SYSTEM',
            '00000000-0000-4000-8000-000000000000',
            key,
            digest,
            action,
          );
        return true;
      });
      if (applied) processed += 1;
    }
    return processed;
  }
}
