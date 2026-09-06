'use client';

import { FloatingChat } from './chat/floating-chat';

export function SellerChatPage() {
  return (
    <section className="seller-chat-page" aria-label="Chat với khách hàng">
      <FloatingChat embedded />
    </section>
  );
}
