-- Verify canonical chat invariants after legacy reconciliation before exposing the API.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM chat_user_conversations c
    WHERE c.participant_low_user_id >= c.participant_high_user_id
       OR c.next_sequence < 1
       OR c.last_message_sequence < 0
       OR c.last_message_sequence >= c.next_sequence
  ) THEN
    RAISE EXCEPTION 'Canonical chat conversation invariant failed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM chat_user_conversations c
    LEFT JOIN LATERAL (
      SELECT count(*) AS membership_count, count(*) FILTER (WHERE m.user_id IN (c.participant_low_user_id, c.participant_high_user_id)) AS participant_membership_count
      FROM chat_user_memberships m
      WHERE m.conversation_id = c.id
    ) counts ON true
    WHERE counts.membership_count <> 2 OR counts.participant_membership_count <> 2
  ) THEN
    RAISE EXCEPTION 'Canonical chat membership invariant failed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM chat_user_messages m
    JOIN chat_user_conversations c ON c.id = m.conversation_id
    WHERE m.sender_user_id NOT IN (c.participant_low_user_id, c.participant_high_user_id)
       OR m.sequence < 1
       OR m.sequence >= c.next_sequence
  ) THEN
    RAISE EXCEPTION 'Canonical chat message invariant failed';
  END IF;
END $$;
