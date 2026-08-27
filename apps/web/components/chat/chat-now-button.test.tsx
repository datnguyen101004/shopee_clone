import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthSession } from '../auth-session-provider';
import { useChat } from './chat-provider';
import { ChatNowButton } from './chat-now-button';

vi.mock('../auth-session-provider', () => ({ useAuthSession: vi.fn() }));
vi.mock('./chat-provider', () => ({ useChat: vi.fn() }));

describe('ChatNowButton', () => {
  const openForShop = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useChat).mockReturnValue({ openForShop } as never);
  });

  it('disables self-chat while keeping an explanatory accessible title', () => {
    vi.mocked(useAuthSession).mockReturnValue({ state: { status: 'authenticated', user: { id: 'owner-1' } } } as never);
    render(<ChatNowButton shopId="shop-1" ownerUserId="owner-1" />);
    const button = screen.getByRole('button', { name: 'Chat ngay' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', 'Bạn không thể chat với chính shop của mình');
  });

  it('opens the provider target for another shop', async () => {
    vi.mocked(useAuthSession).mockReturnValue({ state: { status: 'authenticated', user: { id: 'buyer-1' } } } as never);
    const user = userEvent.setup();
    render(<ChatNowButton shopId="shop-1" ownerUserId="owner-1" />);
    await user.click(screen.getByRole('button', { name: 'Chat ngay' }));
    expect(openForShop).toHaveBeenCalledWith('shop-1');
  });
});
