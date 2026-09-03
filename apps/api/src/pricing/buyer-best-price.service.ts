import type { BuyerBestPricePreview } from '@shopee-clone/contracts';
import { Inject, Injectable, Logger } from '@nestjs/common';

import { MockShippingCalculator } from './mock-shipping.calculator';
import {
  BuyerBestPriceOptimizer,
  DEFAULT_BUYER_BEST_PRICE_LIMITS,
} from './buyer-best-price.optimizer';
import { BuyerBestPriceRepository } from './buyer-best-price.repository';

export interface BuyerPriceProductSnapshot {
  productId: string;
  variantId: string;
  effectivePriceMinor: number;
  weightGrams: number;
  shop: {
    id: string;
    ownerUserId: string;
    slug: string;
    name: string;
    location: string;
    pickupProvince: string | null;
  };
}

function positiveIntegerEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

@Injectable()
export class BuyerBestPriceService {
  private readonly logger = new Logger(BuyerBestPriceService.name);
  private readonly optimizer = new BuyerBestPriceOptimizer();

  constructor(
    @Inject(BuyerBestPriceRepository) private readonly repository: BuyerBestPriceRepository,
    @Inject(MockShippingCalculator) private readonly shipping: MockShippingCalculator,
  ) {}

  enabled(): boolean {
    return process.env.BUYER_BEST_PRICE_PREVIEW_ENABLED === 'true';
  }

  async previews(
    buyerId: string | null,
    products: readonly BuyerPriceProductSnapshot[],
    evaluatedAt: Date,
  ): Promise<Map<string, BuyerBestPricePreview>> {
    if (!buyerId || !this.enabled() || products.length === 0) return new Map();
    const startedAt = performance.now();
    try {
      const shopIds = [...new Set(products.map((product) => product.shop.id))];
      const [address, definitions] = await Promise.all([
        this.repository.loadDefaultAddress(buyerId),
        this.repository.loadVoucherDefinitions(buyerId, shopIds),
      ]);
      const limits = {
        maxCandidatesPerSlot: positiveIntegerEnv(
          'BUYER_BEST_PRICE_MAX_CANDIDATES_PER_SLOT',
          DEFAULT_BUYER_BEST_PRICE_LIMITS.maxCandidatesPerSlot,
        ),
        maxCombinations: positiveIntegerEnv(
          'BUYER_BEST_PRICE_MAX_COMBINATIONS',
          DEFAULT_BUYER_BEST_PRICE_LIMITS.maxCombinations,
        ),
      };
      const previews = new Map<string, BuyerBestPricePreview>();
      for (const product of products) {
        let standardShippingFeeMinor: number | null = null;
        if (
          address &&
          product.shop.pickupProvince &&
          Number.isSafeInteger(product.weightGrams) &&
          product.weightGrams > 0
        ) {
          standardShippingFeeMinor = this.shipping.calculate({
            shopId: product.shop.id,
            originProvince: product.shop.pickupProvince,
            destinationProvince: address.province,
            shipmentWeightGrams: product.weightGrams,
            service: 'STANDARD',
          }).shippingFeeMinor;
        }
        const preview = this.optimizer.optimize(
          {
            productId: product.productId,
            variantId: product.variantId,
            shop: product.shop,
            effectivePriceMinor: product.effectivePriceMinor,
            evaluatedAt,
            standardShippingFeeMinor,
            voucherDefinitions: definitions,
          },
          limits,
        );
        previews.set(product.variantId, preview);
      }
      this.logger.debug(
        `buyer_price_preview_ok products=${products.length} duration_ms=${Math.round(performance.now() - startedAt)}`,
      );
      return previews;
    } catch {
      this.logger.warn('buyer_price_preview_fallback reason=optional_enrichment_failed');
      return new Map();
    }
  }
}
