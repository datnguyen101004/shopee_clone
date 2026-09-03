'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';

function ScrollToTopContent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    // If navigating to a specific hash (e.g. #target), allow anchor scrolling
    if (typeof window !== 'undefined' && window.location.hash) {
      return;
    }

    const scrollToTop = () => {
      if (typeof window !== 'undefined') {
        if (typeof window.scrollTo === 'function') {
          window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        }
        if (document.documentElement) {
          document.documentElement.scrollTop = 0;
        }
        if (document.body) {
          document.body.scrollTop = 0;
        }
      }
    };

    // Scroll immediately
    scrollToTop();

    // Re-verify on next animation frame to ensure layout rendering settles
    const frameId =
      typeof requestAnimationFrame === 'function' ? requestAnimationFrame(scrollToTop) : undefined;

    return () => {
      if (frameId !== undefined && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(frameId);
      }
    };
  }, [pathname, searchParams]);

  return null;
}

export function ScrollToTop() {
  return (
    <Suspense fallback={null}>
      <ScrollToTopContent />
    </Suspense>
  );
}
