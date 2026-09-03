import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('floating chat rollback readiness', () => {
  it('keeps forward migrations non-destructive and preserves committed chat rows', () => {
    const migrationRoot = path.join(process.cwd(), 'prisma/migrations');
    const migrations = [
      '20260827100000_floating_core_chat/migration.sql',
      '20260827103000_floating_core_chat_remove_empty/migration.sql',
      '20260827110000_floating_core_chat_invariant_checks/migration.sql',
    ].map((file) => readFileSync(path.join(migrationRoot, file), 'utf8'));
    for (const sql of migrations) {
      expect(sql).not.toMatch(/\b(DROP TABLE|TRUNCATE)\b/i);
      expect(sql).not.toMatch(/DELETE\s+FROM\s+["']?chat_user_messages/i);
      if (/DELETE\s+FROM\s+["']?chat_user_conversations/i.test(sql)) {
        expect(sql).toMatch(/NOT\s+EXISTS[\s\S]*chat_user_messages/i);
      }
      expect(sql).toContain('chat_user_');
    }
  });
});
