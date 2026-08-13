import {
  isCanonicalEngagementProductId,
  parseEngagementPageQuery,
  parseFavoriteStatusProductIds,
  type EngagementPageQuery,
} from '@shopee-clone/contracts';

import { EngagementValidationError } from './engagement.errors';

export function parseEngagementPagination(value: unknown): EngagementPageQuery {
  const parsed = parseEngagementPageQuery(value);
  if (!parsed) throw new EngagementValidationError(['page', 'pageSize']);
  return parsed;
}

export function parseEngagementProductId(value: string): string {
  if (!isCanonicalEngagementProductId(value)) {
    throw new EngagementValidationError(['productId']);
  }
  return value;
}

export function parseFavoriteStatusIds(value: unknown): string[] {
  const parsed = parseFavoriteStatusProductIds(value);
  if (!parsed) throw new EngagementValidationError(['productIds']);
  return parsed;
}
