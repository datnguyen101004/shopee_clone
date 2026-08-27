import {
  assertExactConfirmation,
  REPAIR_TABLES,
  runChatRepair,
  TARGET_CONVERSATION_ID,
} from './repair-chat-legacy-conversation';

const NEIGHBOR_ID = '11111111-1111-4111-8111-111111111111';

type FakeState = Map<string, Set<string>>;

class FakeDatabase {
  readonly state: FakeState = new Map(
    REPAIR_TABLES.map(({ name }) => [
      name,
      new Set([TARGET_CONVERSATION_ID, NEIGHBOR_ID]) as Set<string>,
    ]),
  );
  readonly missing = new Set<string>();
  skipDeleteFor: string | undefined;
  transactionCalls = 0;

  async $transaction<T>(callback: (tx: unknown) => Promise<T>): Promise<T> {
    this.transactionCalls += 1;
    const snapshot = new Map([...this.state].map(([name, ids]) => [name, new Set(ids)]));
    const tx = {
      $executeRaw: async () => 0,
      $executeRawUnsafe: async (sql: string, id: string) => {
        const table = /FROM\s+"([^"]+)"/i.exec(sql)?.[1];
        if (table && table !== this.skipDeleteFor) this.state.get(table)?.delete(id);
        return 1;
      },
      $queryRaw: async (template: TemplateStringsArray, ...values: unknown[]) => {
        if (template.raw.join('').includes('to_regclass')) {
          const table = String(values[0]).replace(/^public\./, '');
          return [{ exists: !this.missing.has(table) }];
        }
        return [];
      },
      $queryRawUnsafe: async (sql: string, id: string) => {
        const table = /FROM\s+"([^"]+)"/i.exec(sql)?.[1];
        return [{ count: BigInt(table ? (this.state.get(table)?.has(id) ? 1 : 0) : 0) }];
      },
    };
    try {
      return await callback(tx);
    } catch (error) {
      this.state.clear();
      for (const [name, ids] of snapshot) this.state.set(name, ids);
      throw error;
    }
  }
}

describe('exact legacy chat repair', () => {
  it('requires the immutable target as confirmation', () => {
    expect(() => assertExactConfirmation('wrong-id')).toThrow(TARGET_CONVERSATION_ID);
    expect(() => assertExactConfirmation(TARGET_CONVERSATION_ID)).not.toThrow();
  });

  it('deletes only the target, handles missing optional tables, and is idempotent', async () => {
    const database = new FakeDatabase();
    database.missing.add('chat_attachments');

    const first = await runChatRepair(database as never);
    expect(first.before.chat_outbox).toBe(1);
    expect(first.before.chat_attachments).toBe(0);
    expect(first.after.chat_memberships).toBe(0);
    expect(database.state.get('chat_conversations')?.has(NEIGHBOR_ID)).toBe(true);

    const second = await runChatRepair(database as never);
    expect(Object.values(second.before).every((count) => count === 0)).toBe(true);
    expect(Object.values(second.after).every((count) => count === 0)).toBe(true);
  });

  it('rolls back the transaction when post-delete verification fails', async () => {
    const database = new FakeDatabase();
    database.skipDeleteFor = 'chat_memberships';

    await expect(runChatRepair(database as never)).rejects.toThrow('chat_memberships');
    expect(database.state.get('chat_outbox')?.has(TARGET_CONVERSATION_ID)).toBe(true);
    expect(database.state.get('chat_memberships')?.has(TARGET_CONVERSATION_ID)).toBe(true);
  });
});
