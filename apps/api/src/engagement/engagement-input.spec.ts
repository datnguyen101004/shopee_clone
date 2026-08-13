import { EngagementValidationError } from './engagement.errors';
import {
  parseEngagementPagination,
  parseEngagementProductId,
  parseFavoriteStatusIds,
} from './engagement-input';

const id = '00000000-0000-4000-8000-000000000001';

describe('engagement input', () => {
  it('applies bounded canonical pagination', () => {
    expect(parseEngagementPagination({})).toEqual({ page: 1, pageSize: 20 });
    expect(parseEngagementPagination({ page: '2', pageSize: '48' })).toEqual({
      page: 2,
      pageSize: 48,
    });
    for (const query of [{ page: '0' }, { pageSize: '49' }, { page: ['1'] }, { secret: 'x' }]) {
      expect(() => parseEngagementPagination(query)).toThrow(EngagementValidationError);
    }
  });

  it('accepts only canonical unique bounded product identifiers', () => {
    expect(parseEngagementProductId(id)).toBe(id);
    expect(parseFavoriteStatusIds(id)).toEqual([id]);
    expect(() => parseEngagementProductId('not-a-uuid')).toThrow(EngagementValidationError);
    expect(() => parseFavoriteStatusIds(`${id},${id}`)).toThrow(EngagementValidationError);
    expect(() => parseFavoriteStatusIds(Array.from({ length: 49 }, () => id).join(','))).toThrow(
      EngagementValidationError,
    );
  });
});
