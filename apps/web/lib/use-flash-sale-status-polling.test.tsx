import { act, renderHook } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { fetchFlashSaleStatus } from './flash-sale-api';
import { useFlashSaleStatusPolling } from './use-flash-sale-status-polling';

vi.mock('./flash-sale-api', () => ({
  fetchFlashSaleStatus: vi.fn(),
}));

const mockedFetch = vi.mocked(fetchFlashSaleStatus);
const NOW = new Date('2026-09-08T00:00:00.000Z');
const UPCOMING_START = '2026-09-08T00:10:00.000Z';
const ACTIVE_END = '2026-09-08T01:00:00.000Z';

function response(overrides: Partial<Awaited<ReturnType<typeof fetchFlashSaleStatus>>> = {}) {
  return {
    contractVersion: 'flash-sale-v1' as const,
    campaignId: 'campaign-1',
    serverTime: NOW.toISOString(),
    startsAt: UPCOMING_START,
    endsAt: ACTIVE_END,
    items: [
      {
        variantId: 'variant-1',
        productId: 'product-1',
        state: 'UPCOMING' as const,
        stateVersion: 1,
        salePriceMinor: 100,
        canPurchase: false,
        startsAt: UPCOMING_START,
        endsAt: ACTIVE_END,
      },
    ],
    ...overrides,
  };
}

describe('useFlashSaleStatusPolling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    mockedFetch.mockReset();
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('deduplicates concurrent refreshes and ignores a stale in-flight completion', async () => {
    let resolveRequest!: (value: ReturnType<typeof response>) => void;
    mockedFetch.mockReturnValueOnce(new Promise((resolve) => { resolveRequest = resolve; }));
    const { result } = renderHook(() => useFlashSaleStatusPolling({
      campaignId: 'campaign-1',
      variantIds: ['variant-1'],
      initialStartsAt: UPCOMING_START,
      initialEndsAt: ACTIVE_END,
      initialServerTime: NOW.toISOString(),
    }));

    await act(async () => {
      await Promise.resolve();
      const first = result.current.refreshNow();
      const second = result.current.refreshNow();
      expect(mockedFetch).toHaveBeenCalledTimes(1);
      resolveRequest(response());
      await Promise.all([first, second]);
    });

    expect(result.current.statusMap['variant-1']?.state).toBe('UPCOMING');
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });

  it('pauses initial polling while hidden and refreshes immediately on return', async () => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    mockedFetch.mockResolvedValue(response());
    renderHook(() => useFlashSaleStatusPolling({
      campaignId: 'campaign-1',
      variantIds: ['variant-1'],
      initialStartsAt: UPCOMING_START,
      initialEndsAt: ACTIVE_END,
      initialServerTime: NOW.toISOString(),
    }));
    await act(async () => { await Promise.resolve(); });
    expect(mockedFetch).not.toHaveBeenCalled();

    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });

  it('does not start network polling for an already-ended campaign', async () => {
    mockedFetch.mockResolvedValue(response({
      endsAt: '2026-09-07T23:59:00.000Z',
      items: [],
    }));
    const { result } = renderHook(() => useFlashSaleStatusPolling({
      campaignId: 'campaign-1',
      variantIds: ['variant-1'],
      initialStartsAt: '2026-09-07T00:00:00.000Z',
      initialEndsAt: '2026-09-07T23:59:00.000Z',
      initialServerTime: NOW.toISOString(),
    }));
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(result.current.isEnded).toBe(true);
    expect(mockedFetch).not.toHaveBeenCalled();
  });
});
