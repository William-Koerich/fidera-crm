-- Funnel stages are labels with a place in the funnel: "Novo lead", "Agendou", "Virou cliente".
-- A contact sits in one stage at a time; the app moves it by swapping the stage label.
alter table crm.labels
  add column stage_position integer check (stage_position between 0 and 99);

create index labels_stage_idx on crm.labels (organization_id, stage_position) where stage_position is not null;
create index contact_labels_org_label_idx on crm.contact_labels (organization_id, label_id);
