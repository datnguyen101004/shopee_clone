import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { getFavoriteStatus, setFavorite } from '../../lib/engagement-api';
import { useAuthSession } from '../auth-session-provider';
import { FavoriteButton } from './favorite-button';
import { FavoriteStateProvider } from './favorite-state-provider';

vi.mock('../../lib/engagement-api', () => ({ getFavoriteStatus: vi.fn(), setFavorite: vi.fn() }));
vi.mock('../auth-session-provider', () => ({ useAuthSession: vi.fn() }));

const firstId = '00000000-0000-4000-8000-000000000101';
const secondId = '00000000-0000-4000-8000-000000000102';
const auth = {
  state: {
    status: 'authenticated' as const,
    user: {
      id: '00000000-0000-4000-8000-000000000001',
      email: 'buyer@example.test',
      displayName: 'Buyer',
      status: 'active' as const,
      roles: ['buyer'] as ['buyer'],
    },
  },
  authenticatedFetch: vi.fn(),
};

describe('favorite state coordinator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuthSession).mockReturnValue(auth as never);
    vi.mocked(getFavoriteStatus).mockResolvedValue({
      items: [
        { productId: firstId, isFavorite: false },
        { productId: secondId, isFavorite: true },
      ],
    });
  });

  it('hydrates visible products in one batch and confirms optimistic changes', async () => {
    vi.mocked(setFavorite).mockResolvedValue({
      productId: firstId,
      isFavorite: true,
      favoritedAt: '2026-08-13T03:00:00.000Z',
    });
    const user = userEvent.setup();
    render(
      <FavoriteStateProvider productIds={[firstId, secondId, firstId]}>
        <FavoriteButton productId={firstId} compact />
        <FavoriteButton productId={secondId} compact />
      </FavoriteStateProvider>,
    );
    await waitFor(() =>
      expect(getFavoriteStatus).toHaveBeenCalledWith([firstId, secondId], auth.authenticatedFetch),
    );
    expect(getFavoriteStatus).toHaveBeenCalledTimes(1);
    const add = screen.getByRole('button', { name: 'Thêm vào yêu thích' });
    await user.click(add);
    expect(add).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(setFavorite).toHaveBeenCalledTimes(1));
  });

  it('guards duplicate submissions and rolls back with an accessible error', async () => {
    let reject!: () => void;
    vi.mocked(setFavorite).mockReturnValue(
      new Promise((_, fail) => {
        reject = () => fail(new Error('offline'));
      }),
    );
    const user = userEvent.setup();
    render(
      <FavoriteStateProvider productIds={[firstId]}>
        <FavoriteButton productId={firstId} />
      </FavoriteStateProvider>,
    );
    const button = await screen.findByRole('button', { name: 'Thêm vào yêu thích' });
    await user.click(button);
    await user.click(button);
    expect(setFavorite).toHaveBeenCalledTimes(1);
    reject();
    await waitFor(() => expect(button).toHaveAttribute('aria-pressed', 'false'));
    expect(screen.getByRole('alert')).toHaveTextContent('Không thể cập nhật yêu thích');
  });
});
