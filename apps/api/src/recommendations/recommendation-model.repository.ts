import { Inject, Injectable } from '@nestjs/common';

import type { Prisma } from '../generated/prisma/client';
import { RecommendationModelActivationStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { CURRENT_RECOMMENDATION_VERSIONS, type TrainedRankingModel } from './recommendation.types';

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function isCompatibleRankingModel(model: {
  productProjectionVersion: number;
  featureSchemaVersion: number;
  storedScriptVersion: number;
}): boolean {
  const current = (
    model.productProjectionVersion === CURRENT_RECOMMENDATION_VERSIONS.productProjectionVersion &&
    model.featureSchemaVersion === CURRENT_RECOMMENDATION_VERSIONS.featureSchemaVersion &&
    model.storedScriptVersion === CURRENT_RECOMMENDATION_VERSIONS.storedScriptVersion
  );
  // Keep the previous all-v1 model readable while the additive campaign
  // projection is rebuilt. New active models are still queried strictly by
  // findActiveCompatible using the current versions.
  const previous = model.productProjectionVersion === 1 && model.featureSchemaVersion === 1 && model.storedScriptVersion === 1;
  return current || previous;
}

@Injectable()
export class RecommendationModelRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  upsertCandidate(model: TrainedRankingModel) {
    return this.prisma.personalizedRankingModel.upsert({
      where: { modelVersion: model.modelVersion },
      create: {
        modelVersion: model.modelVersion,
        productProjectionVersion: model.productProjectionVersion,
        featureSchemaVersion: model.featureSchemaVersion,
        storedScriptVersion: model.storedScriptVersion,
        datasetVersion: model.datasetVersion,
        randomSeed: model.randomSeed,
        trainingSource: model.trainingSource,
        intercept: model.intercept,
        featureWeights: jsonValue(model.featureWeights),
        metrics: jsonValue(model.metrics),
        activationStatus: RecommendationModelActivationStatus.CANDIDATE,
        trainedAt: model.trainedAt,
      },
      update: {
        productProjectionVersion: model.productProjectionVersion,
        featureSchemaVersion: model.featureSchemaVersion,
        storedScriptVersion: model.storedScriptVersion,
        datasetVersion: model.datasetVersion,
        randomSeed: model.randomSeed,
        trainingSource: model.trainingSource,
        intercept: model.intercept,
        featureWeights: jsonValue(model.featureWeights),
        metrics: jsonValue(model.metrics),
        activationStatus: RecommendationModelActivationStatus.CANDIDATE,
        trainedAt: model.trainedAt,
        activatedAt: null,
      },
    });
  }

  findActiveCompatible() {
    return this.prisma.personalizedRankingModel.findFirst({
      where: {
        activationStatus: RecommendationModelActivationStatus.ACTIVE,
        productProjectionVersion: CURRENT_RECOMMENDATION_VERSIONS.productProjectionVersion,
        featureSchemaVersion: CURRENT_RECOMMENDATION_VERSIONS.featureSchemaVersion,
        storedScriptVersion: CURRENT_RECOMMENDATION_VERSIONS.storedScriptVersion,
      },
      orderBy: [{ modelVersion: 'desc' }, { activatedAt: 'desc' }],
    });
  }

  findByVersion(modelVersion: number) {
    return this.prisma.personalizedRankingModel.findUnique({ where: { modelVersion } });
  }

  async activateCompatible(modelVersion: number, activatedAt = new Date()) {
    return this.prisma.$transaction(async (transaction) => {
      const candidate = await transaction.personalizedRankingModel.findUnique({
        where: { modelVersion },
      });
      if (!candidate) throw new Error(`Recommendation model ${modelVersion} does not exist.`);
      if (!isCompatibleRankingModel(candidate)) {
        throw new Error(
          `Recommendation model ${modelVersion} is incompatible with the active feature versions.`,
        );
      }

      await transaction.personalizedRankingModel.updateMany({
        where: {
          activationStatus: RecommendationModelActivationStatus.ACTIVE,
          modelVersion: { not: modelVersion },
        },
        data: { activationStatus: RecommendationModelActivationStatus.RETIRED },
      });
      return transaction.personalizedRankingModel.update({
        where: { modelVersion },
        data: { activationStatus: RecommendationModelActivationStatus.ACTIVE, activatedAt },
      });
    });
  }
}
