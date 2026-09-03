import {
  RETURN_VERSION,
  isAdminReturnDetailResponse,
  isReturnDetailResponse,
  isReturnListResponse,
  returnActionsFor,
  type AdminReturnDetailResponse,
  type ReturnActorType,
  type ReturnDetailResponse,
  type ReturnListResponse,
  type ReturnSummary,
} from '@shopee-clone/contracts';
import { Injectable } from '@nestjs/common';

import type { Prisma } from '../generated/prisma/client';
import { checkedMoneyFromBigInt } from '../pricing/money';
import { ReturnUnavailableError } from './return-errors';
import type { ReturnRequestGraph } from './return-repository';

function jsonRecord(value: Prisma.JsonValue): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ReturnUnavailableError();
  return value as Record<string, unknown>;
}

function asText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

@Injectable()
export class ReturnProjector {
  private summary(graph: ReturnRequestGraph, actor: ReturnActorType): ReturnSummary {
    return {
      returnReference: graph.id,
      orderReference: graph.orderId,
      status: graph.status,
      version: graph.version,
      reasonCode: graph.reasonCode,
      refundAmountMinor: checkedMoneyFromBigInt(graph.refundAmountMinor),
      deadline: {
        eligibilityAt: graph.eligibilityDeadlineAt.toISOString(),
        sellerResponseAt: graph.sellerResponseDeadlineAt?.toISOString() ?? null,
        shipmentAt: graph.shipmentDeadlineAt?.toISOString() ?? null,
        receiptAt: graph.receiptDeadlineAt?.toISOString() ?? null,
      },
      updatedAt: graph.updatedAt.toISOString(),
      availableActions: returnActionsFor(graph.status, actor),
    };
  }

  list(
    graphs: ReturnRequestGraph[],
    actor: ReturnActorType,
    limit: number,
    nextCursor: string | null,
  ): ReturnListResponse {
    const result: ReturnListResponse = {
      returnVersion: RETURN_VERSION,
      items: graphs.map((graph) => this.summary(graph, actor)),
      page: { limit, nextCursor },
    };
    if (!isReturnListResponse(result)) throw new ReturnUnavailableError();
    return result;
  }

  detail(
    graph: ReturnRequestGraph,
    actor: Extract<ReturnActorType, 'BUYER' | 'SELLER'>,
  ): ReturnDetailResponse {
    const destination = graph.shipment ? jsonRecord(graph.shipment.destination) : null;
    const sellerPublicReason =
      [...graph.events]
        .reverse()
        .find((event) => event.actorType === 'SELLER' && event.publicReason)?.publicReason ?? null;
    const result: ReturnDetailResponse = {
      returnVersion: RETURN_VERSION,
      return: {
        ...this.summary(graph, actor),
        currency: 'VND',
        description: graph.description,
        lines: graph.items.map((item) => ({
          lineReference: item.orderLine.sourceCartLineId,
          productName: item.orderLine.productName,
          variantName: item.orderLine.variantName,
          productImageUrl: item.orderLine.productImageUrl,
          purchasedQuantity: item.purchasedQuantity,
          requestedQuantity: item.requestedQuantity,
          payableMerchandiseMinor: checkedMoneyFromBigInt(item.payableMinor),
          refundMinor: checkedMoneyFromBigInt(item.refundMinor),
        })),
        evidence: graph.evidence.map((asset) => ({
          evidenceId: asset.id,
          mimeType: asset.mimeType as 'image/jpeg' | 'image/png' | 'image/webp',
          bytes: asset.byteSize,
          width: asset.width,
          height: asset.height,
          url: `/api/v1/return-evidence/${asset.id}`,
        })),
        timeline: graph.events.map((event) => ({
          id: event.id,
          version: event.version,
          previousStatus: event.previousStatus,
          status: event.status,
          actorType: event.actorType,
          occurredAt: event.occurredAt.toISOString(),
          reasonCode: event.reasonCode,
          publicReason: event.publicReason,
        })),
        shipment: graph.shipment
          ? {
              trackingCode: graph.shipment.trackingCode,
              submittedAt: graph.shipment.submittedAt.toISOString(),
              destination: {
                shopName: asText(destination?.shopName, graph.shop.name),
                address: asText(destination?.address),
              },
            }
          : null,
        refund: graph.refundLedger
          ? {
              kind: graph.refundLedger.kind,
              amountMinor: checkedMoneyFromBigInt(graph.refundLedger.amountMinor),
              finalizedAt: graph.refundLedger.createdAt.toISOString(),
            }
          : null,
        sellerPublicReason,
      },
    };
    if (!isReturnDetailResponse(result)) throw new ReturnUnavailableError();
    return result;
  }

  adminDetail(graph: ReturnRequestGraph): AdminReturnDetailResponse {
    const buyerSellerDetail = this.detail(graph, 'SELLER');
    const result: AdminReturnDetailResponse = {
      returnVersion: RETURN_VERSION,
      return: {
        ...buyerSellerDetail.return,
        availableActions: returnActionsFor(graph.status, 'ADMIN'),
        buyer: { id: graph.buyer.id, displayName: graph.buyer.displayName },
        shop: { id: graph.shop.id, name: graph.shop.name },
        decisions: graph.decisions.map((decision) => ({
          id: decision.id,
          decision: decision.decision as 'APPROVE_RETURN' | 'APPROVE_REFUND' | 'REJECT',
          publicReason: decision.publicReason,
          internalNote: decision.internalNote,
          decidedAt: decision.decidedAt.toISOString(),
        })),
      },
    };
    if (!isAdminReturnDetailResponse(result)) throw new ReturnUnavailableError();
    return result;
  }
}
