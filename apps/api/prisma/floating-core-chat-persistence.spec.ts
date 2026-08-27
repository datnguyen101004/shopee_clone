import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('floating core chat persistence migration', () => {
  const migration = readFileSync(path.join(process.cwd(), 'prisma/migrations/20260827100000_floating_core_chat/migration.sql'), 'utf8');

  it('keeps the historical foundation untouched and creates canonical user-pair tables', () => {
    expect(migration).toContain('chat_user_conversations');
    expect(migration).toContain('participant_low_user_id');
    expect(migration).toContain('participant_high_user_id');
    expect(migration).toContain('Cannot reconcile duplicate legacy chat user pairs');
    expect(migration).toContain('Cannot reconcile invalid legacy chat memberships');
    expect(migration).not.toContain('DROP TABLE "chat_conversations"');
  });

  it('refuses ambiguous legacy data and preserves ordered message columns', () => {
    expect(migration).toContain('Cannot reconcile duplicate legacy client message ids');
    expect(migration).toContain('Cannot reconcile invalid legacy chat sequence or read state');
    expect(migration).toContain('SELECT id, conversation_id, sequence, sender_user_id, client_message_id, request_digest, content, created_at');
  });
});
