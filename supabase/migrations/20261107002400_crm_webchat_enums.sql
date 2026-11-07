-- Chat on the business's own website. New enum values are committed here, before any use.
alter type crm.channel add value if not exists 'webchat';
alter type crm.channel_provider add value if not exists 'webchat';
alter type crm.contact_source add value if not exists 'webchat_inbound';
