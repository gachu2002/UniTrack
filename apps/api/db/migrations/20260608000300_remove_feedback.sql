-- +goose Up
DELETE FROM resource_links WHERE related_entity_type = 'feedback';
DELETE FROM uploaded_files WHERE related_entity_type IN ('feedback', 'feedback_reply');

ALTER TABLE resource_links
    DROP CONSTRAINT IF EXISTS resource_links_related_entity_type_check,
    ADD CONSTRAINT resource_links_related_entity_type_check CHECK (related_entity_type IN ('project', 'milestone', 'task', 'progress_update'));

ALTER TABLE uploaded_files
    DROP CONSTRAINT IF EXISTS uploaded_files_related_entity_type_check,
    ADD CONSTRAINT uploaded_files_related_entity_type_check CHECK (related_entity_type IN ('project', 'task', 'progress_update', 'resource_link'));

DROP TRIGGER IF EXISTS feedback_replies_set_updated_at ON feedback_replies;
DROP TRIGGER IF EXISTS feedback_set_updated_at ON feedback;
DROP TABLE IF EXISTS feedback_replies;
DROP TABLE IF EXISTS feedback;

-- +goose Down
CREATE TABLE feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL CHECK (target_type IN ('project', 'student', 'milestone', 'task', 'progress_update')),
    target_id UUID NOT NULL,
    visibility TEXT NOT NULL CHECK (visibility IN ('project', 'private')),
    recipient_student_id UUID REFERENCES users(id),
    content TEXT NOT NULL,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (
        (visibility = 'project' AND recipient_student_id IS NULL)
        OR
        (visibility = 'private' AND recipient_student_id IS NOT NULL)
    )
);

CREATE TABLE feedback_replies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    feedback_id UUID NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
    replied_by UUID NOT NULL REFERENCES users(id),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER feedback_set_updated_at BEFORE UPDATE ON feedback FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER feedback_replies_set_updated_at BEFORE UPDATE ON feedback_replies FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_feedback_project_id ON feedback(project_id);
CREATE INDEX idx_feedback_target ON feedback(target_type, target_id);
CREATE INDEX idx_feedback_recipient_student_id ON feedback(recipient_student_id);

ALTER TABLE resource_links
    DROP CONSTRAINT IF EXISTS resource_links_related_entity_type_check,
    ADD CONSTRAINT resource_links_related_entity_type_check CHECK (related_entity_type IN ('project', 'milestone', 'task', 'progress_update', 'feedback'));

ALTER TABLE uploaded_files
    DROP CONSTRAINT IF EXISTS uploaded_files_related_entity_type_check,
    ADD CONSTRAINT uploaded_files_related_entity_type_check CHECK (related_entity_type IN ('project', 'task', 'progress_update', 'feedback', 'feedback_reply', 'resource_link'));
