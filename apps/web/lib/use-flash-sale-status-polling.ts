'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { FlashSaleSkuStatusItem, FlashSaleStatusResponse } from './flash-sale-types';
import { fetchFlashSaleStatus } from './flash-sale-api';
import { RoleApiError } from './role-api';

export interface UseFlashSaleStatusPollingOptions {
  campaignId: string;
  variantIds: string[];
  initialStartsAt?: string;
  initialEndsAt?: string;
  initialServerTime?: string;
  enabled?: boolean;
  onStatusUpdate?: (statusMap: Record<string, FlashSaleSkuStatusItem>) => void;
}

export interface FlashSaleStatusPollingResult {
  statusMap: Record<string, FlashSaleSkuStatusItem>;
  isLive: boolean;
  isUpcoming: boolean;
  isEnded: boolean;
  serverNow: Date;
  countdownSeconds: number;
  refreshNow: () => Promise<void>;
}

export function useFlashSaleStatusPolling({
  campaignId,
  variantIds,
  initialStartsAt,
  initialEndsAt,
  initialServerTime,
  enabled = true,
  onStatusUpdate,
}: UseFlashSaleStatusPollingOptions): FlashSaleStatusPollingResult {
  const [statusMap, setStatusMap] = useState<Record<string, FlashSaleSkuStatusItem>>({});
  const [startsAt, setStartsAt] = useState<string | null>(initialStartsAt ?? null);
  const [endsAt, setEndsAt] = useState<string | null>(initialEndsAt ?? null);
  const [serverTimeOffset, setServerTimeOffset] = useState<number>(() => {
    if (initialServerTime) {
      return new Date(initialServerTime).getTime() - Date.now();
    }
    return 0;
  });

  const [currentCountdown, setCurrentCountdown] = useState<number>(0);
  const [clockMs, setClockMs] = useState(() => Date.now());
  const inFlightRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const serverRetryAfterRef = useRef<number | null>(null);
  const unmountedRef = useRef(false);

  // Stable list of variantIds
  const variantIdsKey = Array.from(new Set(variantIds.filter(Boolean))).sort().join(',');

  const syncStatus = useCallback(async () => {
    if (inFlightRef.current || !variantIdsKey || !campaignId) return;
    inFlightRef.current = true;
    try {
      const res: FlashSaleStatusResponse = await fetchFlashSaleStatus(campaignId, variantIdsKey.split(','));
      if (unmountedRef.current) return;

      if (res.serverTime) {
        setServerTimeOffset(new Date(res.serverTime).getTime() - Date.now());
      }
      if (res.startsAt) setStartsAt(res.startsAt);
      if (res.endsAt) setEndsAt(res.endsAt);

      const newMap: Record<string, FlashSaleSkuStatusItem> = {};
      for (const item of res.items) {
        newMap[item.variantId] = item;
      }
      setStatusMap((prev) => {
        const next = { ...prev, ...newMap };
        return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
      });
      if (onStatusUpdate) onStatusUpdate(newMap);
    } catch (error) {
      if (error instanceof RoleApiError && error.problem?.retryAfterSeconds) {
        serverRetryAfterRef.current = Math.max(1, error.problem.retryAfterSeconds) * 1000;
      }
    } finally {
      inFlightRef.current = false;
    }
  }, [campaignId, onStatusUpdate, variantIdsKey]);

  // Derive current phase
  const nowMs = clockMs + serverTimeOffset;
  const startsAtMs = startsAt ? new Date(startsAt).getTime() : 0;
  const endsAtMs = endsAt ? new Date(endsAt).getTime() : 0;

  const isUpcoming = startsAtMs > 0 && nowMs < startsAtMs;
  const isLive = startsAtMs > 0 && endsAtMs > 0 && nowMs >= startsAtMs && nowMs < endsAtMs;
  const isEnded = endsAtMs > 0 && nowMs >= endsAtMs;

  // Countdown timer calculation (every 1 second locally without firing network requests)
  useEffect(() => {
    const updateCountdown = () => {
      const currentServerNow = Date.now() + serverTimeOffset;
      setClockMs(Date.now());
      if (isUpcoming && startsAtMs > 0) {
        const diffSec = Math.max(0, Math.floor((startsAtMs - currentServerNow) / 1000));
        setCurrentCountdown(diffSec);
      } else if (isLive && endsAtMs > 0) {
        const diffSec = Math.max(0, Math.floor((endsAtMs - currentServerNow) / 1000));
        setCurrentCountdown(diffSec);
      } else {
        setCurrentCountdown(0);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [isUpcoming, isLive, startsAtMs, endsAtMs, serverTimeOffset]);

  // Polling loop with randomized jitter and tab visibility gating
  useEffect(() => {
    if (!enabled || isEnded || !variantIdsKey) return;
    unmountedRef.current = false;

    let stopped = false;

    const scheduleNextPoll = () => {
      if (stopped || isEnded) return;

      // Jitter interval:
      // Phase 1: 10000ms - 15000ms
      // Phase 2 or 3: 3000ms - 5000ms
      const baseDelay = isUpcoming ? 10000 + Math.random() * 5000 : 3000 + Math.random() * 2000;
      const serverRetryAfter = serverRetryAfterRef.current;
      serverRetryAfterRef.current = null;

      // If upcoming and close to start (less than baseDelay ms), schedule right at 0-500ms after startsAt
      let delay = Math.max(baseDelay, serverRetryAfter ?? 0);
      if (isUpcoming && startsAtMs > 0) {
        const timeToStart = startsAtMs - (Date.now() + serverTimeOffset);
        if (timeToStart > 0 && timeToStart < baseDelay) {
          delay = timeToStart + Math.random() * 500; // 0-500ms after startsAt
        }
      }

      timerRef.current = setTimeout(async () => {
        if (!document.hidden && !stopped) {
          await syncStatus();
        }
        scheduleNextPoll();
      }, delay);
    };

    // Initial sync
    if (!document.hidden) queueMicrotask(() => void syncStatus());
    scheduleNextPoll();

    // Pause while hidden, immediate sync on tab return
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        void syncStatus();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stopped = true;
      unmountedRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, isEnded, isUpcoming, startsAtMs, serverTimeOffset, syncStatus, variantIdsKey]);

  return {
    statusMap,
    isLive,
    isUpcoming,
    isEnded,
    serverNow: new Date(clockMs + serverTimeOffset),
    countdownSeconds: currentCountdown,
    refreshNow: syncStatus,
  };
}
