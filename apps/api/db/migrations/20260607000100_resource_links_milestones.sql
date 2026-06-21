-- +goose Up
ALTER TABLE resource_links
    DROP CONSTRAINT IF EXISTS resource_links_related_entity_type_check,
    ADD CONSTRAINT resource_links_related_entity_type_check CHECK (related_entity_type IN ('project', 'milestone', 'task', 'progress_update', 'meeting_note', 'feedback'));

CREATE UNIQUE INDEX idx_resource_links_unique_target_url
    ON resource_links(project_id, COALESCE(related_entity_type, 'project'), COALESCE(related_entity_id, project_id), lower(url));

-- +goose Down
DROP INDEX IF EXISTS idx_resource_links_unique_target_url;

ALTER TABLE resource_links
    DROP CONSTRAINT IF EXISTS resource_links_related_entity_type_check,
    ADD CONSTRAINT resource_links_related_entity_type_check CHECK (related_entity_type IN ('project', 'task', 'progress_update', 'meeting_note', 'feedback'));
