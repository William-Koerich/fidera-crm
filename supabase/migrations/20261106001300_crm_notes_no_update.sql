-- The schema's default privileges also granted UPDATE. Notes and contact labels have no
-- update policy, so RLS already blocked it silently; now it is refused outright.
revoke update on crm.conversation_notes, crm.contact_labels from authenticated;
