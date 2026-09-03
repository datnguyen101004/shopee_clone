import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ScrollToTop } from './scroll-to-top';

let mockPathname = '/';
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useSearchParams: () => mockSearchParams,
}));

describe('ScrollToTop', () => {
  beforeEach(() => {
    mockPathname = '/';
    mockSearchParams = new URLSearchParams();
    window.scrollTo = vi.fn();
    document.documentElement.scrollTop = 500;
    document.body.scrollTop = 500;
    window.location.hash = '';
  });

  it('scrolls to top on mount', () => {
    render(<ScrollToTop />);

    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'instant' });
    expect(document.documentElement.scrollTop).toBe(0);
    expect(document.body.scrollTop).toBe(0);
  });

  it('does not scroll to top if an anchor hash is present', () => {
    window.location.hash = '#reviews';
    document.documentElement.scrollTop = 350;

    render(<ScrollToTop />);

    expect(window.scrollTo).not.toHaveBeenCalled();
    expect(document.documentElement.scrollTop).toBe(350);
  });

  it('scrolls to top when pathname changes', () => {
    const { rerender } = render(<ScrollToTop />);
    expect(window.scrollTo).toHaveBeenCalledTimes(1);

    mockPathname = '/products/item-1';
    rerender(<ScrollToTop />);

    expect(window.scrollTo).toHaveBeenCalledTimes(2);
  });
});
