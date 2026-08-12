import { describe, expect, it } from 'vitest';

import { isHomepageResponse, parseHomepageResponse } from '../src';

const response = {
  evaluatedAt: '2026-08-12T00:00:00.000Z',
  modules: [
    {
      id: 'module-1',
      key: 'categories',
      type: 'category-shortcuts',
      title: 'Danh mục',
      sortOrder: 1,
      categories: [
        { id: 'cat-1', label: 'Điện tử', icon: '⚡', href: '/search?category=electronics' },
      ],
    },
  ],
};

describe('homepage contract', () => {
  it('accepts a valid discriminated response', () => {
    expect(isHomepageResponse(response)).toBe(true);
  });

  it('rejects malformed payloads', () => {
    expect(isHomepageResponse({ ...response, evaluatedAt: 'today' })).toBe(false);
    expect(
      isHomepageResponse({ ...response, modules: [{ type: 'flash-sale', products: 'no' }] }),
    ).toBe(false);
  });

  it('filters unknown future module types while retaining known modules', () => {
    expect(
      parseHomepageResponse({ ...response, modules: [...response.modules, { type: 'future' }] }),
    ).toEqual(response);
  });
});
