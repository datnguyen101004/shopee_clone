'use client';

import { useChat } from './chat-provider';
import { useAuthSession } from '../auth-session-provider';

export function ChatNowButton({
  shopId,
  ownerUserId,
  label = 'Chat ngay',
}: {
  shopId: string;
  ownerUserId?: string;
  label?: string;
}) {
  const chat = useChat();
  const auth = useAuthSession();
  const self =
    Boolean(ownerUserId) &&
    auth.state.status === 'authenticated' &&
    auth.state.user?.id === ownerUserId;
  return (
    <button
      type="button"
      className="chat-now-button"
      disabled={self}
      title={self ? 'Bạn không thể chat với chính shop của mình' : undefined}
      onClick={() => void chat.openForShop(shopId)}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
      <span>{label}</span>
    </button>
  );
}
