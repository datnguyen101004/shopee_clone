'use client';

import { useEffect, useRef } from 'react';

import { recordRecentlyViewed } from '../../lib/engagement-api';
import { useAuthSession } from '../auth-session-provider';

export function RecentlyViewedRecorder({ productId }: { productId: string }) {
  const auth = useAuthSession();
  const recorded = useRef<string | null>(null);
  useEffect(() => {
    if (auth.state.status !== 'authenticated') {
      recorded.current = null;
      return;
    }
    const key = `${auth.state.user.id}:${productId}`;
    if (recorded.current === key) return;
    recorded.current = key;
    void recordRecentlyViewed(productId, auth.authenticatedFetch).catch(() => {
      // Product rendering and purchase remain available when behavioral recording fails.
    });
  }, [auth.authenticatedFetch, auth.state, productId]);
  return null;
}
