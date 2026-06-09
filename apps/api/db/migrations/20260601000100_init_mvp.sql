-- +goose Up
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'teacher', 'student')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    topic TEXT,
    supervisor_id UUID NOT NULL REFERENCES users(id),
    start_date DATE,
    end_date DATE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'on_hold', 'completed', 'archived')),
    official_progress_state TEXT NOT NULL DEFAULT 'no_progress'
        CHECK (official_progress_state IN ('no_progress', 'in_progress', 'needs_changes', 'completed')),
    progress_summary TEXT,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

CREATE TABLE project_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    member_role TEXT NOT NULL DEFAULT 'member' CHECK (member_role IN ('member', 'leader')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (project_id, student_id)
);

CREATE TABLE invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student')),
    token_hash TEXT NOT NULL UNIQUE,
    invited_by UUID NOT NULL REFERENCES users(id),
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (project_id IS NOT NULL)
);

CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parent_task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'todo'
        CHECK (status IN ('todo', 'in_progress', 'submitted', 'needs_changes', 'done')),
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
    deadline TIMESTAMPTZ,
    official_progress_state TEXT NOT NULL DEFAULT 'no_progress'
        CHECK (official_progress_state IN ('no_progress', 'in_progress', 'needs_changes', 'completed')),
    created_by UUID NOT NULL REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE task_assignees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (task_id, student_id)
);

CREATE TABLE progress_updates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    submitted_by UUID NOT NULL REFERENCES users(id),
    title TEXT,
    description TEXT NOT NULL,
    blockers TEXT,
    review_status TEXT NOT NULL DEFAULT 'pending_review'
        CHECK (review_status IN ('pending_review', 'approved', 'needs_changes', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE progress_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    progress_update_id UUID NOT NULL REFERENCES progress_updates(id) ON DELETE CASCADE,
    reviewed_by UUID NOT NULL REFERENCES users(id),
    review_status TEXT NOT NULL CHECK (review_status IN ('approved', 'needs_changes', 'rejected')),
    review_comment TEXT,
    official_progress_state TEXT CHECK (official_progress_state IN ('no_progress', 'in_progress', 'needs_changes', 'completed')),
    reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

CREATE TABLE feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL CHECK (target_type IN ('project', 'student', 'task', 'progress_update')),
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

CREATE TABLE resource_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    related_entity_type TEXT CHECK (related_entity_type IN ('project', 'task', 'progress_update', 'meeting_note', 'feedback')),
    related_entity_id UUID,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'external_link'
        CHECK (type IN ('external_link', 'github', 'google_drive', 'document', 'design', 'other')),
    description TEXT,
    added_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (
        (related_entity_type IS NULL AND related_entity_id IS NULL)
        OR
        (related_entity_type IS NOT NULL AND related_entity_id IS NOT NULL)
    )
);

CREATE TABLE uploaded_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    related_entity_type TEXT NOT NULL CHECK (related_entity_type IN ('project', 'task', 'progress_update', 'meeting_note', 'feedback', 'feedback_reply', 'resource_link')),
    related_entity_id UUID NOT NULL,
    original_file_name TEXT NOT NULL,
    stored_file_name TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    mime_type TEXT,
    file_size_bytes BIGINT NOT NULL CHECK (file_size_bytes >= 0),
    uploaded_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES users(id),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id UUID,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER projects_set_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER invitations_set_updated_at BEFORE UPDATE ON invitations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER tasks_set_updated_at BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER progress_updates_set_updated_at BEFORE UPDATE ON progress_updates FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER meeting_notes_set_updated_at BEFORE UPDATE ON meeting_notes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER feedback_set_updated_at BEFORE UPDATE ON feedback FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER feedback_replies_set_updated_at BEFORE UPDATE ON feedback_replies FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER resource_links_set_updated_at BEFORE UPDATE ON resource_links FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX idx_projects_supervisor_id ON projects(supervisor_id);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_created_by ON projects(created_by);
CREATE INDEX idx_project_members_project_id ON project_members(project_id);
CREATE INDEX idx_project_members_student_id ON project_members(student_id);
CREATE INDEX idx_invitations_project_id ON invitations(project_id);
CREATE INDEX idx_invitations_email ON invitations(email);
CREATE INDEX idx_invitations_expires_at ON invitations(expires_at);
CREATE INDEX idx_tasks_project_id ON tasks(project_id);
CREATE INDEX idx_tasks_parent_task_id ON tasks(parent_task_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_priority ON tasks(priority);
CREATE INDEX idx_tasks_deadline ON tasks(deadline);
CREATE INDEX idx_task_assignees_task_id ON task_assignees(task_id);
CREATE INDEX idx_task_assignees_student_id ON task_assignees(student_id);
CREATE INDEX idx_progress_updates_project_id ON progress_updates(project_id);
CREATE INDEX idx_progress_updates_task_id ON progress_updates(task_id);
CREATE INDEX idx_progress_updates_submitted_by ON progress_updates(submitted_by);
CREATE INDEX idx_progress_updates_review_status ON progress_updates(review_status);
CREATE INDEX idx_progress_reviews_progress_update_id ON progress_reviews(progress_update_id);
CREATE INDEX idx_progress_reviews_reviewed_by ON progress_reviews(reviewed_by);
CREATE INDEX idx_meeting_notes_project_id ON meeting_notes(project_id);
CREATE INDEX idx_meeting_notes_meeting_at ON meeting_notes(meeting_at);
CREATE INDEX idx_feedback_project_id ON feedback(project_id);
CREATE INDEX idx_feedback_target ON feedback(target_type, target_id);
CREATE INDEX idx_feedback_recipient_student_id ON feedback(recipient_student_id);
CREATE INDEX idx_resource_links_project_id ON resource_links(project_id);
CREATE INDEX idx_resource_links_related_entity ON resource_links(related_entity_type, related_entity_id);
CREATE INDEX idx_uploaded_files_project_id ON uploaded_files(project_id);
CREATE INDEX idx_uploaded_files_related_entity ON uploaded_files(related_entity_type, related_entity_id);
CREATE INDEX idx_activity_logs_project_id ON activity_logs(project_id);
CREATE INDEX idx_activity_logs_created_at ON activity_logs(created_at);

-- +goose Down
DROP TABLE IF EXISTS activity_logs;
DROP TABLE IF EXISTS uploaded_files;
DROP TABLE IF EXISTS resource_links;
DROP TABLE IF EXISTS feedback_replies;
DROP TABLE IF EXISTS feedback;
DROP TABLE IF EXISTS meeting_note_attendees;
DROP TABLE IF EXISTS meeting_notes;
DROP TABLE IF EXISTS progress_reviews;
DROP TABLE IF EXISTS progress_updates;
DROP TABLE IF EXISTS task_assignees;
DROP TABLE IF EXISTS tasks;
DROP TABLE IF EXISTS invitations;
DROP TABLE IF EXISTS project_members;
DROP TABLE IF EXISTS projects;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS users;
DROP FUNCTION IF EXISTS set_updated_at();
