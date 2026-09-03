import { render, waitFor } from '@testing-library/react';

import { recordRecentlyViewed } from '../../lib/engagement-api';
import { useAuthSession } from '../auth-session-provider';
import { RecentlyViewedRecorder } from './recently-viewed-recorder';

vi.mock('../../lib/engagement-api', () => ({ recordRecentlyViewed: vi.fn() }));
vi.mock('../auth-session-provider', () => ({ useAuthSession: vi.fn() }));

const productId = '00000000-0000-4000-8000-000000000101';
const authenticatedFetch = vi.fn();
const user = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'buyer@example.test',
  displayName: 'Buyer',
  status: 'active' as const,
  roles: ['buyer'] as ['buyer'],
};

describe('RecentlyViewedRecorder', () => {
  beforeEach(() => vi.clearAllMocks());

  it('never records a guest view', () => {
    vi.mocked(useAuthSession).mockReturnValue({
      state: { status: 'guest', user: null },
      authenticatedFetch,
    } as never);
    render(<RecentlyViewedRecorder productId={productId} />);
    expect(recordRecentlyViewed).not.toHaveBeenCalled();
  });

  it('records once per authenticated mounted product and tolerates failure', async () => {
    vi.mocked(useAuthSession).mockReturnValue({
      state: { status: 'authenticated', user },
      authenticatedFetch,
    } as never);
    vi.mocked(recordRecentlyViewed).mockRejectedValue(new Error('offline'));
    const view = render(<RecentlyViewedRecorder productId={productId} />);
    await waitFor(() => expect(recordRecentlyViewed).toHaveBeenCalledTimes(1));
    view.rerender(<RecentlyViewedRecorder productId={productId} />);
    await waitFor(() => expect(recordRecentlyViewed).toHaveBeenCalledTimes(1));
  });
});
