-- +goose Up
DELETE FROM resource_links WHERE related_entity_type = 'meeting_note';
DELETE FROM uploaded_files WHERE related_entity_type = 'meeting_note';

ALTER TABLE resource_links
    DROP CONSTRAINT IF EXISTS resource_links_related_entity_type_check,
    ADD CONSTRAINT resource_links_related_entity_type_check CHECK (related_entity_type IN ('project', 'milestone', 'task', 'progress_update', 'feedback'));

ALTER TABLE uploaded_files
    DROP CONSTRAINT IF EXISTS uploaded_files_related_entity_type_check,
    ADD CONSTRAINT uploaded_files_related_entity_type_check CHECK (related_entity_type IN ('project', 'task', 'progress_update', 'feedback', 'feedback_reply', 'resource_link'));

DROP TRIGGER IF EXISTS meeting_notes_set_updated_at ON meeting_notes;
DROP TABLE IF EXISTS meeting_note_attendees;
DROP TABLE IF EXISTS meeting_notes;

-- +goose Down
CREATE TABLE meeting_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    meeting_at TIMESTAMPTZ NOT NULL,
    discussion_points TEXT,
    decisions TEXT,
    action_items TEXT,
    created_by UUID NOT NULL REFERENCES users(id),
    last_edited_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE meeting_note_attendees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_note_id UUID NOT NULL REFERENCES meeting_notes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE (meeting_note_id, user_id)
);

CREATE TRIGGER meeting_notes_set_updated_at BEFORE UPDATE ON meeting_notes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_meeting_notes_project_id ON meeting_notes(project_id);
CREATE INDEX idx_meeting_notes_meeting_at ON meeting_notes(meeting_at);

ALTER TABLE resource_links
    DROP CONSTRAINT IF EXISTS resource_links_related_entity_type_check,
    ADD CONSTRAINT resource_links_related_entity_type_check CHECK (related_entity_type IN ('project', 'milestone', 'task', 'progress_update', 'meeting_note', 'feedback'));

ALTER TABLE uploaded_files
    DROP CONSTRAINT IF EXISTS uploaded_files_related_entity_type_check,
    ADD CONSTRAINT uploaded_files_related_entity_type_check CHECK (related_entity_type IN ('project', 'task', 'progress_update', 'meeting_note', 'feedback', 'feedback_reply', 'resource_link'));
