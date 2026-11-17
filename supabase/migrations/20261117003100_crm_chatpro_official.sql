-- A ChatPro instance connects a number either by QR Code (WhatsApp Web, unofficial)
-- or through Meta's official API (Cloud API, with coexistence: the WhatsApp Business
-- app keeps working). Official numbers follow Meta's rules: free-form replies only
-- within 24 hours of the customer's last message, templates outside it.
alter table crm.channel_accounts
  add column official_api boolean not null default false;
