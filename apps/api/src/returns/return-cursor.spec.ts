import { encodeReturnCursor, decodeReturnCursor } from './return-cursor';

describe('return list cursors', () => {
  const query = {
    status: 'REQUESTED' as const,
    deadline: 'ALL' as const,
    from: null,
    to: null,
    reference: null,
    limit: 20,
    cursor: null,
  };

  it('round-trips filter-bound positions and rejects mismatched filters', () => {
    const encoded = encodeReturnCursor(query, {
      updatedAt: new Date('2026-08-20T12:00:00.000Z'),
      id: '00000000-0000-4000-8000-000000000401',
    });
    expect(decodeReturnCursor(encoded, query)).toEqual({
      updatedAt: new Date('2026-08-20T12:00:00.000Z'),
      id: '00000000-0000-4000-8000-000000000401',
    });
    expect(
      decodeReturnCursor(encoded, { ...query, status: 'ESCALATED' }),
    ).toBeNull();
    expect(decodeReturnCursor('not-a-cursor', query)).toBeNull();
  });
});
