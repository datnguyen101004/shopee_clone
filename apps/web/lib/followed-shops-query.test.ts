import { describe, expect, it } from 'vitest';

import {
  followedShopsHref,
  FollowedShopsRouteQueryError,
  pickFollowedShopsQuery,
} from './followed-shops-query';

describe('followed-shops account route query', () => {
  it('normalizes defaults and builds canonical pagination URLs', () => {
    expect(pickFollowedShopsQuery({})).toEqual({ page: 1, pageSize: 20 });
    expect(pickFollowedShopsQuery({ page: '3', pageSize: '12' })).toEqual({
      page: 3,
      pageSize: 12,
    });
    expect(followedShopsHref({ page: 2, pageSize: 12 })).toBe(
      '/account/followed-shops?page=2&pageSize=12',
    );
  });

  it('rejects repeated, unknown, unsafe, and out-of-bound values', () => {
    expect(() => pickFollowedShopsQuery({ page: ['1', '2'] })).toThrow(
      FollowedShopsRouteQueryError,
    );
    expect(() => pickFollowedShopsQuery({ ownerId: 'private' })).toThrow(
      FollowedShopsRouteQueryError,
    );
    expect(() => pickFollowedShopsQuery({ pageSize: '49' })).toThrow(FollowedShopsRouteQueryError);
    expect(() => followedShopsHref({ page: 0 })).toThrow(FollowedShopsRouteQueryError);
  });
});
