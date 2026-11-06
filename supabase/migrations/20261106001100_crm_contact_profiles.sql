-- Name and photo from the channel's profile. The photo is a copy in the private bucket.
alter table crm.contacts
  add column avatar_path text,
  add column profile_synced_at timestamptz;

-- WhatsApp privacy ids (LID) arrived as if they were phones. No phone number has
-- more than 15 digits (E.164). The channel identity keeps the id for sending.
update crm.contacts set phone_normalized = null where length(phone_normalized) > 15;
update crm.contact_identities set phone_normalized = null where length(phone_normalized) > 15;
